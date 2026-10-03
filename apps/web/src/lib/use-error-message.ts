'use client';

import { ApiError, errorCodes } from '@jordan-sports/contracts/web';
import { useTranslations } from 'next-intl';

/** Maps any thrown error to a translated, user-safe message. */
export function useErrorMessage() {
  const t = useTranslations('common.errors');
  return (error: unknown): string => {
    if (error instanceof ApiError && (errorCodes as readonly string[]).includes(error.code)) {
      return t(error.code);
    }
    return t('INTERNAL_ERROR');
  };
}
