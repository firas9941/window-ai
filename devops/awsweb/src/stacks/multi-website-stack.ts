import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface SharedInfrastructureStackProps extends cdk.StackProps {
  /**
   * Shared S3 bucket name for all websites
   */
  bucketName: string;
}

/**
 * Stack for shared infrastructure (S3 bucket)
 */
export class SharedInfrastructureStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: SharedInfrastructureStackProps) {
    super(scope, id, props);

    // Create shared S3 bucket for all websites
    this.bucket = new s3.Bucket(this, 'SharedWebsiteBucket', {
      bucketName: props.bucketName,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Always retain in production
      autoDeleteObjects: false,
      versioned: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'delete-incomplete-multipart-uploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
        {
          id: 'delete-old-versions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    // Output bucket name for reference
    new cdk.CfnOutput(this, 'SharedBucketName', {
      value: this.bucket.bucketName,
      description: 'Shared S3 bucket name for all websites',
    });
  }
}

export interface WebsiteStackProps extends cdk.StackProps {
  /**
   * Website domain name (e.g., mysite.danduh.me)
   */
  domain: string;
  
  /**
   * Site name used for S3 folder prefix
   */
  siteName: string;
  
  /**
   * Shared S3 bucket name for websites
   */
  bucketName: string;
  
  /**
   * ACM certificate ARN for CloudFront (must be in us-east-1)
   */
  certificateArn: string;
  
  /**
   * Whether to create default HTML file
   */
  createDefaultHtml?: boolean;
}

export class WebsiteStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly websiteUrl: string;

  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    // Import the existing S3 bucket
    const bucket = s3.Bucket.fromBucketName(this, 'SharedBucket', props.bucketName);

    // Import the ACM certificate
    const certificate = certificatemanager.Certificate.fromCertificateArn(
      this,
      'Certificate',
      props.certificateArn,
    );

    // Create Origin Access Identity for CloudFront to access S3
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'OAI',
      {
        comment: `OAI for ${props.siteName}`,
      },
    );

    // Note: Since we're using an imported bucket, we need to manually set the bucket policy
    // The bucket policy JSON will be provided in the stack outputs

    // Viewer-request rewrite (SEO): the app uses clean, extensionless URLs
    // (e.g. /observability, /chat/chat-api-documentation) but the prerender step
    // writes FLAT files keyed by the last path segment (observability.html,
    // chat-api-documentation.html). Without this, clean paths miss in S3 and fall
    // through the 403/404 error response to index.html — so crawlers get the home
    // page's <head> for every route (a soft-404). This maps a clean path to its
    // flat prerendered file so each route serves its own SEO meta.
    //
    // Safe by construction:
    //  - '/' is left to defaultRootObject (index.html).
    //  - Anything whose last segment already has a '.' (assets, .html, .xml, .txt)
    //    passes through untouched.
    //  - Unknown routes rewrite to a missing key and still fall back to the SPA
    //    via the existing errorResponses (no regression).
    const rewriteToPrerendered = new cloudfront.Function(this, 'RewriteToPrerendered', {
      comment: `Clean URL -> flat prerendered .html for ${props.domain}`,
      code: cloudfront.FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var request = event.request;',
          '  var uri = request.uri;',
          "  if (uri === '/') { return request; }",
          // strip trailing slashes so "/x/" behaves like "/x"
          "  while (uri.length > 1 && uri.charAt(uri.length - 1) === '/') {",
          '    uri = uri.substring(0, uri.length - 1);',
          '  }',
          "  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);",
          // already a file (has an extension) -> serve as-is
          "  if (lastSegment.indexOf('.') !== -1) { return request; }",
          // extensionless route -> matching flat prerendered file
          "  request.uri = '/' + lastSegment + '.html';",
          '  return request;',
          '}',
        ].join('\n'),
      ),
    });

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(bucket, {
          originPath: `/${props.siteName}`,
          originAccessIdentity,
        }),
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: rewriteToPrerendered,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      domainNames: [props.domain],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      enableIpv6: true,
      comment: `CloudFront distribution for ${props.domain}`,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
      ],
    });

    this.websiteUrl = `https://${props.domain}`;

    // Create default HTML file if requested
    if (props.createDefaultHtml) {
      const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${props.siteName}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f0f0f0;
        }
        .container {
            text-align: center;
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-bottom: 1rem;
        }
        p {
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hello World!</h1>
        <p>Welcome to ${props.siteName} at ${props.domain}</p>
        <p>This is a default page. Replace this with your actual content.</p>
    </div>
</body>
</html>`;

      new s3deploy.BucketDeployment(this, 'DefaultContent', {
        sources: [
          s3deploy.Source.data('index.html', defaultHtml),
        ],
        destinationBucket: bucket,
        destinationKeyPrefix: props.siteName,
        distribution: this.distribution,
        distributionPaths: ['/*'],
      });
    }

    // Stack Outputs
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: this.websiteUrl,
      description: 'Website URL',
    });

    new cdk.CfnOutput(this, 'S3Path', {
      value: `s3://${props.bucketName}/${props.siteName}/`,
      description: 'S3 path for this website',
    });

    new cdk.CfnOutput(this, 'OriginAccessIdentityId', {
      value: originAccessIdentity.originAccessIdentityId,
      description: 'CloudFront Origin Access Identity ID - needed for S3 bucket policy',
    });

    new cdk.CfnOutput(this, 'BucketPolicyStatement', {
      value: JSON.stringify({
        Effect: 'Allow',
        Principal: {
          AWS: `arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${originAccessIdentity.originAccessIdentityId}`
        },
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${props.bucketName}/${props.siteName}/*`
      }, null, 2),
      description: 'Bucket policy statement to add to S3 bucket policy (manually)',
    });
  }
}
