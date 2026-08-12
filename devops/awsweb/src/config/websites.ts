/**
 * Configuration for static websites
 */
export interface WebsiteConfig {
  domain: string;
  siteName: string;
  /**
   * CloudFormation stack name override. ONLY needed when the live stack was
   * created under a different name than `website-<siteKey>`. Changing a stack
   * name makes CDK try to CREATE a brand-new distribution, which fails on a
   * CNAME conflict with the live one (and could take the site down) — so when
   * a stack already owns the live distribution, pin its historical name here.
   */
  stackId?: string;
}

/**
 * Websites configuration
 * Add new websites here to create their CloudFront distributions
 */
export const WEBSITES: Record<string, WebsiteConfig> = {
  windowai: {
    domain: 'windowai.danduh.me',
    siteName: 'windowai',
    // HISTORICAL QUIRK (verified 2026-08-12): the live distribution
    // E1AK8XMYOGOHOC that serves windowai.danduh.me is owned by the
    // CloudFormation stack `website-browserai` (the site key was renamed
    // browserai -> windowai after the original deploy; the stack kept the old
    // name). Deploys MUST target that stack — do not "fix" this name without
    // a full stack rename/import migration.
    stackId: 'website-browserai',
  },
  // Add more websites here as needed
  // example: {
  //   domain: 'example.danduh.me',
  //   siteName: 'example',
  // },
};

/**
 * Common configuration for all websites
 */
export const COMMON_CONFIG = {
  /**
   * Shared S3 bucket for all websites
   */
  bucketName: 'danduh-static-websites',
  
  /**
   * Shared ACM certificate ARN (must be in us-east-1 for CloudFront)
   */
  certificateArn: 'arn:aws:acm:us-east-1:411429114957:certificate/e3ea7859-fa8e-4da2-8e7a-3819310c2c8c',
} as const;
