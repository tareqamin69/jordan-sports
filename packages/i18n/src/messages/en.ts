/**
 * English UI catalog (ICU MessageFormat). The Arabic catalog must have exactly the same
 * keys and placeholders; this is enforced by the type of `ar` and by unit tests.
 */
export const en = {
  common: {
    appName: 'Jordan Sports',
    languageSwitcher: {
      label: 'Language',
      switchTo: 'العربية',
    },
    notFound: {
      title: 'Page not found',
      description: 'The page you are looking for does not exist.',
      backHome: 'Back to home',
    },
  },
  web: {
    metadata: {
      title: 'Jordan Sports',
      description: 'A sports participation and booking platform for Jordan.',
    },
    home: {
      title: 'Sports booking for Jordan',
      description:
        'We are building a platform to discover sports venues in Amman and book them online.',
      status: 'Early development build. Booking is not available yet.',
    },
  },
  admin: {
    metadata: {
      title: 'Jordan Sports Admin',
    },
    home: {
      title: 'Platform administration',
      status: 'Early development build. Administration tools are not available yet.',
    },
  },
} as const;
