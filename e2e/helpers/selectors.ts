/**
 * Centralized selectors for E2E tests.
 * Prefer aria labels and roles over data-testid when possible.
 */
export const SEL = {
  // Title bar
  titleBar: '.discord-titlebar',
  titleBarName: '.discord-titlebar-name',

  // Icon Rail
  rail: '.icon-rail',
  railBtn: '.icon-rail-btn',

  // Sidebar
  sidebar: '.sidebar',
  subjectItem: '.sidebar-item',

  // Command Palette
  paletteInput: '.palette-input',
  paletteItem: '.palette-item',

  // Viewer / Editor
  viewer: '.viewer',
  editorContent: '.ProseMirror',

  // Settings
  settingsPanel: '.settings-panel',

  // Onboarding
  onboardingWizard: '.onboarding-wizard',
  onboardingNext: '.onboarding-btn-next',

  // FAQ
  faqPanel: '.faq-panel',
  faqSearch: '.faq-search input',

  // File List
  fileList: '.filelist',
  fileListItem: '.file-item',
} as const;
