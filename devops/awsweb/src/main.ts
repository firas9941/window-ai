import * as cdk from 'aws-cdk-lib';
import { ApplicationStack } from './stacks/application-stack.js';
import { SharedInfrastructureStack, WebsiteStack } from './stacks/multi-website-stack.js';
import { WEBSITES, COMMON_CONFIG } from './config/websites.js';

const app = new cdk.App({
  // Policy validation can be added later if needed
  // policyValidationBeta1: [
  //   new CfnGuardValidator(RuleSet.WELL_ARCHITECTED_RELIABILITY),
  // ],
});

// Use this to deploy your own sandbox environment (assumes your CLI credentials)
new ApplicationStack(app, 'monorepo-infra-sandbox', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  crossRegionReferences: true,
});

// Create shared infrastructure (S3 bucket)
new SharedInfrastructureStack(app, 'static-websites-shared', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  crossRegionReferences: true,
  bucketName: COMMON_CONFIG.bucketName,
});

// Create individual website stacks
// This allows deploying websites individually
const targetSite = process.env.DEPLOY_SITE;

if (targetSite) {
  // Deploy specific site
  const siteConfig = WEBSITES[targetSite];
  if (!siteConfig) {
    throw new Error(`Website '${targetSite}' not found in configuration. Available sites: ${Object.keys(WEBSITES).join(', ')}`);
  }
  
  new WebsiteStack(app, siteConfig.stackId ?? `website-${targetSite}`, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
    crossRegionReferences: true,
    domain: siteConfig.domain,
    siteName: siteConfig.siteName,
    bucketName: COMMON_CONFIG.bucketName,
    certificateArn: COMMON_CONFIG.certificateArn,
    // NEVER true for a live site: the seed BucketDeployment defaults to
    // prune:true, which would DELETE everything under the site's S3 prefix and
    // replace it with a "Hello World" page. Real content is deployed by the
    // GitHub workflow (S3 sync), so the seeder is never needed.
    createDefaultHtml: false,
  });
} else {
  // Deploy all websites when no specific site is targeted
  Object.entries(WEBSITES).forEach(([siteKey, siteConfig]) => {
    new WebsiteStack(app, siteConfig.stackId ?? `website-${siteKey}`, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      },
      crossRegionReferences: true,
      domain: siteConfig.domain,
      siteName: siteConfig.siteName,
      bucketName: COMMON_CONFIG.bucketName,
      certificateArn: COMMON_CONFIG.certificateArn,
      createDefaultHtml: false, // Don't recreate HTML on every deployment
    });
  });
}

app.synth();
