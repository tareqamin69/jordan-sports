import type { MessageCatalog } from './types.js';

/**
 * Arabic UI catalog (ICU MessageFormat). Typed against the English catalog's shape so
 * that a missing or extra key fails the build.
 */
export const ar = {
  common: {
    appName: 'رياضة الأردن',
    languageSwitcher: {
      label: 'اللغة',
      switchTo: 'English',
    },
    notFound: {
      title: 'الصفحة غير موجودة',
      description: 'الصفحة التي تبحث عنها غير موجودة.',
      backHome: 'العودة إلى الرئيسية',
    },
  },
  web: {
    metadata: {
      title: 'رياضة الأردن',
      description: 'منصة للمشاركة الرياضية وحجز الملاعب في الأردن.',
    },
    home: {
      title: 'حجز الملاعب في الأردن',
      description:
        'نعمل على بناء منصة لاكتشاف الملاعب والمنشآت الرياضية في عمّان وحجزها عبر الإنترنت.',
      status: 'نسخة تطوير أولية. الحجز غير متاح بعد.',
    },
  },
  admin: {
    metadata: {
      title: 'لوحة إدارة رياضة الأردن',
    },
    home: {
      title: 'إدارة المنصة',
      status: 'نسخة تطوير أولية. أدوات الإدارة غير متاحة بعد.',
    },
  },
} as const satisfies MessageCatalog;
