/**
 * Per-site DOM selectors, used when a page has no JSON-LD JobPosting.
 * One entry per job board; each field lists selectors tried in order.
 * When a site redesigns and breaks, the fix belongs here and nowhere else.
 */
export type SiteSelectors = {
  /** Substring matched against location.hostname. */
  host: string;
  title?: string[];
  company?: string[];
  location?: string[];
  salary?: string[];
  description?: string[];
};

export const SITES: SiteSelectors[] = [
  {
    // Guest/logged-out pages only. The authenticated app has no usable
    // classes at all and is handled by parseLinkedInApp in parse.ts.
    host: "linkedin.com",
    title: ["h1.top-card-layout__title", ".job-details-jobs-unified-top-card__job-title h1", "h1"],
    company: [
      ".topcard__org-name-link",
      ".job-details-jobs-unified-top-card__company-name a",
      "a[data-tracking-control-name*='topcard-org-name']",
    ],
    location: [
      ".topcard__flavor--bullet",
      ".job-details-jobs-unified-top-card__primary-description-container span",
    ],
    description: [".description__text", ".show-more-less-html__markup", "#job-details"],
  },
  {
    host: "greenhouse.io",
    title: [".app-title", ".job__title h1", "h1"],
    company: [".company-name", ".job__company"],
    location: [".location", ".job__location"],
    description: ["#content", ".job__description", "#job_description"],
  },
  {
    host: "lever.co",
    title: [".posting-headline h2"],
    location: [".posting-categories .location", ".posting-category.location", ".sort-by-time.posting-category"],
    description: ["[data-qa='job-description']", ".posting-page .section-wrapper"],
  },
  {
    host: "ashbyhq.com",
    title: ["h1[class*='title']", "h1"],
    location: ["[class*='locations']", "[class*='location']"],
    description: ["[class*='description']"],
  },
  {
    host: "myworkdayjobs.com",
    title: ["[data-automation-id='jobPostingHeader']"],
    location: ["[data-automation-id='locations'] dd", "[data-automation-id='location']"],
    description: ["[data-automation-id='jobPostingDescription']"],
  },
  {
    host: "indeed.com",
    title: ["h1.jobsearch-JobInfoHeader-title", "[data-testid='jobsearch-JobInfoHeader-title']"],
    company: ["[data-testid='inlineHeader-companyName']", "[data-company-name='true']"],
    location: ["[data-testid='inlineHeader-companyLocation']", "[data-testid='job-location']"],
    salary: ["#salaryInfoAndJobType .attribute_snippet", "[data-testid*='salary']"],
    description: ["#jobDescriptionText"],
  },
];

export function siteFor(hostname: string): SiteSelectors | undefined {
  return SITES.find((s) => hostname === s.host || hostname.endsWith(`.${s.host}`));
}
