/**
 * Legal and help pages (terms, venue-owner terms, privacy, how it works + FAQ).
 *
 * INTERNAL — DRAFT FOR LEGAL REVIEW. These texts were written by the product team to match how the
 * platform works (ADR-0020: card-only payments collected by Jorena, refunds to the card, weekly
 * payouts to venues). They must be reviewed by a Jordanian lawyer before launch; see
 * docs/legal/README.md. Nothing on the pages says "draft" to users.
 *
 * Kept here rather than in the UI message catalogs: they are long documents, not interface strings.
 * `{appName}` is replaced with the brand name when rendered.
 */

import { LEGAL_TEXTS_VERSION } from '@jordan-sports/contracts/web';

export type LegalDocId = 'terms' | 'venueTerms' | 'privacy' | 'refunds' | 'cookies' | 'howItWorks';

export interface LegalSection {
  /** Anchor for deep links (e.g. /how-it-works#refunds). */
  id?: string;
  heading: string;
  paragraphs: string[];
  /** Question/answer pairs (FAQ sections). */
  faq?: Array<{ q: string; a: string }>;
}

export interface LegalDoc {
  title: string;
  description: string;
  intro?: string;
  sections: LegalSection[];
}

/**
 * Shown as "last updated". The same value is recorded with every sign-up consent
 * (LEGAL_TEXTS_VERSION in packages/contracts): bump it there when the text actually changes.
 */
export const LEGAL_UPDATED_AT = LEGAL_TEXTS_VERSION;

export const legalDocs: Record<LegalDocId, Record<'ar' | 'en', LegalDoc>> = {
  terms: {
    ar: {
      title: 'الشروط والأحكام',
      description: 'شروط استخدام {appName} للحجز والدفع والإلغاء.',
      intro:
        'باستخدامك {appName} (الموقع أو التطبيق) إنت موافق على هاي الشروط. إذا مش موافق عليها، لا تستخدم المنصة.',
      sections: [
        {
          heading: 'شو هي {appName}',
          paragraphs: [
            '{appName} منصة أردنية بتعرض ملاعب وساحات رياضية مستقلة بكل الأردن، وبتخليك تشوف الأوقات الفاضية وتحجز وتدفع أونلاين.',
            'الملاعب مش ملك {appName}. كل ملعب بيديره صاحبه، وهو المسؤول عن المكان والخدمة وعن دقة معلوماته (الصور، الأسعار، ساعات الدوام، المرافق).',
          ],
        },
        {
          heading: 'حسابك',
          paragraphs: [
            'بتسجّل برقم موبايلك وكود بيوصلك برسالة. لازم يكون عمرك 16 سنة أو أكثر، وعشان تدفع بالبطاقة لازم يكون عمرك 18 سنة أو أكثر.',
            'إنت مسؤول عن أي حجز بينعمل من حسابك. لا تعطي كود الدخول لحدا.',
          ],
        },
        {
          id: 'payment',
          heading: 'الدفع',
          paragraphs: [
            'الدفع بيكون كامل وقت الحجز، بالبطاقة (فيزا أو ماستركارد) بس. ما في دفع بالملعب.',
            '{appName} هي اللي بتستلم المبلغ منك (التاجر اللي بيظهر على كشف البطاقة)، وبعدين بتحوّل للملعب حصته بعد ما تخصم عمولتها.',
            'الدفع بيصير على صفحة دفع آمنة تبعت مزوّد الدفع أو البنك. إحنا ما بنشوف ولا بنخزّن رقم بطاقتك.',
            'الحجز ما بيتأكد إلا لما ينجح الدفع. لما تختار وقت، بنحجزه إلك مؤقتًا لدقايق قليلة لحد ما تدفع؛ إذا ما دفعت خلالها الوقت بيرجع فاضي.',
            'الأسعار بالدينار الأردني وبتظهر كاملة قبل الدفع.',
          ],
        },
        {
          id: 'cancellation',
          heading: 'الإلغاء واسترجاع المبلغ',
          paragraphs: [
            'كل ملعب بيحدد مدة إلغاء مجاني قبل موعد الحجز (بتظهرلك قبل ما تدفع وبصفحة الحجز). إذا ألغيت خلالها، بيرجعلك المبلغ كامل.',
            'إذا ألغيت بعد ما تخلص مدة الإلغاء المجاني، بيرجعلك حسب قاعدة الملعب: ولا إشي، أو نص المبلغ، أو المبلغ كامل. القاعدة بتظهرلك بوضوح قبل الدفع، والقاعدة اللي بتنطبق هي اللي كانت وقت ما حجزت.',
            'إذا الملعب لغى حجزك لأي سبب، بيرجعلك المبلغ كامل دايمًا.',
            'إذا ما إجيت على الحجز بدون ما تلغي، ما بيرجعلك إشي.',
            'المبلغ بيرجع على نفس البطاقة اللي دفعت فيها، وعادةً بيوصل خلال 5–10 أيام عمل حسب البنك. التفاصيل كاملة بسياسة الإلغاء والاسترجاع.',
          ],
        },
        {
          heading: 'مسؤولية الملعب ومسؤوليتك',
          paragraphs: [
            'الملعب مسؤول عن جاهزية المكان بالوقت المحجوز وعن سلامته وعن الخدمة اللي بيقدمها. أي مشكلة بالمكان نفسه بتنحل مع الملعب، و{appName} بتساعدك تتواصل معه وبتتابع البلاغ.',
            'إنت مسؤول عن الالتزام بتعليمات الملعب وعن أي ضرر بتسببه.',
            'إذا صار خلاف، بلّغنا من صفحة «بلّغ عن مشكلة» وفريقنا بيتابع مع الطرفين.',
          ],
        },
        {
          heading: 'الاستخدام المقبول',
          paragraphs: [
            'ممنوع تستخدم المنصة لحجوزات وهمية، أو تحاول تعطّلها، أو تستخدم بيانات حدا ثاني. بنقدر نوقف أي حساب بيخالف هاي الشروط.',
          ],
        },
        {
          heading: 'حدود مسؤولية {appName}',
          paragraphs: [
            '{appName} بتسهّل الحجز والدفع. ما بنكون مسؤولين عن أي إصابة أو خسارة بتصير بالملعب، إلا بالحدود اللي بيفرضها القانون.',
            'بنحاول تكون المنصة شغالة دايمًا، بس ممكن تتوقف أحيانًا للصيانة أو لأسباب خارجة عن إرادتنا.',
          ],
        },
        {
          heading: 'التعديلات والقانون',
          paragraphs: [
            'ممكن نعدّل هاي الشروط، وبنحدّث تاريخ «آخر تحديث» تحت. الحجوزات الموجودة بتضل على الشروط وقاعدة الإلغاء اللي كانت وقت الحجز.',
            'هاي الشروط بتخضع لقوانين المملكة الأردنية الهاشمية، والمحاكم الأردنية هي المختصة.',
          ],
        },
      ],
    },
    en: {
      title: 'Terms and conditions',
      description: 'Terms for booking, paying and cancelling on {appName}.',
      intro:
        'By using {appName} (the website or app) you agree to these terms. If you do not agree, do not use the platform.',
      sections: [
        {
          heading: 'What {appName} is',
          paragraphs: [
            '{appName} is a Jordanian platform that lists independent sports venues across Jordan and lets you see free times, book and pay online.',
            '{appName} does not own the venues. Each venue is run by its owner, who is responsible for the place, the service and the accuracy of its information (photos, prices, opening hours, amenities).',
          ],
        },
        {
          heading: 'Your account',
          paragraphs: [
            'You sign up with your mobile number and a code sent by text message. You must be 16 or older, and 18 or older to pay by card.',
            'You are responsible for any booking made from your account. Do not share your sign-in code.',
          ],
        },
        {
          id: 'payment',
          heading: 'Payment',
          paragraphs: [
            'You pay the full amount when you book, by card (Visa or Mastercard) only. There is no paying at the venue.',
            '{appName} collects the payment from you (it is the merchant on your card statement) and then pays the venue its share after keeping its commission.',
            'You pay on the secure payment page of our payment provider or bank. We never see or store your card number.',
            'A booking is confirmed only once the payment succeeds. When you pick a time we hold it for you for a few minutes while you pay; if you do not pay in time, the time is released.',
            'Prices are in Jordanian dinars and shown in full before you pay.',
          ],
        },
        {
          id: 'cancellation',
          heading: 'Cancellation and refunds',
          paragraphs: [
            'Each venue sets a free-cancellation period before the booking starts (shown before you pay and on your booking). Cancel within it and you get a full refund.',
            'If you cancel after the free-cancellation period, you are refunded according to the venue’s rule: nothing, half, or the full amount. The rule is shown clearly before you pay, and the rule in effect when you booked is the one that applies.',
            'If the venue cancels your booking for any reason, you always get a full refund.',
            'If you do not show up and did not cancel, nothing is refunded.',
            'Refunds go back to the card you paid with and usually arrive within 5–10 business days, depending on your bank. Full details are in the cancellation and refund policy.',
          ],
        },
        {
          heading: 'Venue responsibilities and yours',
          paragraphs: [
            'The venue is responsible for having the place ready at the booked time, for its safety and for its service. Problems with the place itself are resolved with the venue; {appName} helps you reach it and follows up on your report.',
            'You are responsible for following the venue’s rules and for any damage you cause.',
            'If there is a dispute, report it from “Report a problem” and our team will follow up with both sides.',
          ],
        },
        {
          heading: 'Acceptable use',
          paragraphs: [
            'Do not use the platform for fake bookings, try to disrupt it, or use someone else’s details. We may suspend any account that breaks these terms.',
          ],
        },
        {
          heading: 'Limits of {appName}’s liability',
          paragraphs: [
            '{appName} facilitates booking and payment. We are not liable for any injury or loss at a venue, except as required by law.',
            'We aim to keep the platform available, but it may be unavailable at times for maintenance or reasons beyond our control.',
          ],
        },
        {
          heading: 'Changes and governing law',
          paragraphs: [
            'We may change these terms and will update the “last updated” date below. Existing bookings keep the terms and cancellation rule in effect when they were made.',
            'These terms are governed by the laws of the Hashemite Kingdom of Jordan, and Jordanian courts have jurisdiction.',
          ],
        },
      ],
    },
  },

  venueTerms: {
    ar: {
      title: 'شروط أصحاب الملاعب',
      description: 'شروط عرض ملعبك على {appName}: العمولة والتحويلات والإلغاء.',
      intro:
        'هاي الشروط بتنطبق على أي منشأة أو صاحب ملعب بيسجّل على {appName}، بالإضافة للشروط والأحكام العامة. بإرسالك الملعب للمراجعة إنت موافق عليها.',
      sections: [
        {
          heading: 'التسجيل والمراجعة',
          paragraphs: [
            'بتسجّل ملعبك بنفسك: المعلومات والموقع والصور والساحات والأسعار وساعات الدوام. فريق {appName} بيراجع الطلب قبل ما يظهر للاعبين، وممكن يطلب تعديلات أو يرفضه مع ذكر السبب.',
            'إنت مسؤول إن كل المعلومات صحيحة ومحدّثة.',
          ],
        },
        {
          id: 'photos',
          heading: 'الصور',
          paragraphs: [
            'بترفع بس صور إلك حق فيها (صوّرتها إنت أو عندك إذن)، وبتكون لمكانك الحقيقي وبحالته الحالية. ما في صور لأشخاص بدون إذنهم.',
            'بتعطي {appName} إذن غير حصري ومجاني تعرض الصور وتصغّرها وتقصّها على المنصة وبمشاركات الملعب (زي روابط واتساب)، طول ما الملعب معروض. لما تحذف صورة بنوقف نعرضها.',
            'أي حدا بيقدر يبلّغ عن صورة مخالفة. بنراجع البلاغ وممكن نشيل الصورة.',
          ],
        },
        {
          id: 'payments',
          heading: 'الدفع والعمولة',
          paragraphs: [
            'اللاعبين بيدفعوا كامل المبلغ بالبطاقة وقت الحجز، و{appName} بتستلمه كتاجر. ما بتستلم من اللاعب أي دفعة إضافية عن الحجوزات اللي عبر المنصة.',
            '{appName} بتاخد عمولة كنسبة من المبلغ اللي دفعه اللاعب (بعد طرح أي مبلغ رجع للاعب). النسبة بتظهر بلوحة الملعب بقسم «المستحقات»، وأي تغيير عليها بينطبق على الحجوزات الجديدة بس.',
            'الحجوزات اللي بتضيفها إنت يدويًا (تلفون أو مباشرة) ما عليها عمولة، وما بتمر على {appName}.',
          ],
        },
        {
          id: 'payouts',
          heading: 'التحويلات (المستحقات)',
          paragraphs: [
            'كل أسبوع (يوم الأحد) بنحوّلك صافي مستحقات الحجوزات اللي انلعبت أو انتهى وقتها بالأسبوع اللي قبل: المبلغ المدفوع ناقص المبلغ المسترجع ناقص العمولة.',
            'التحويل بيكون على حساب بنكي أردني (IBAN) باسم صاحب الملعب أو المنشأة. صاحب الملعب بس بيقدر يضيفه أو يغيّره، وكل تغيير بينسجل. إذا ما في حساب، المستحقات بتضل محفوظة لحد ما تضيفه.',
            'بتقدر تشوف كل حجز: المدفوع والعمولة وإلك، وكل تحويل ورقم حوالته، من «المستحقات».',
          ],
        },
        {
          id: 'cancellation',
          heading: 'الإلغاء والاسترجاع',
          paragraphs: [
            'إنت بتحدد مدة الإلغاء المجاني، وشو بيرجع للاعب إذا لغى متأخر (ولا إشي، نص المبلغ، أو كامل المبلغ). القاعدة اللي بتنطبق على كل حجز هي اللي كانت وقت ما انحجز.',
            'إذا إنت لغيت حجز لأي سبب، اللاعب بيرجعله المبلغ كامل، وما بتاخد عن هاد الحجز إشي. الإلغاء المتكرر ممكن يأثر على ظهور الملعب أو يوصل لإيقافه.',
            'إذا اللاعب لغى متأخر، الجزء اللي ما رجع للاعب بيدخل بمستحقاتك (بعد العمولة). وإذا ما إجا اللاعب، المبلغ كامل بيدخل بمستحقاتك (بعد العمولة).',
          ],
        },
        {
          heading: 'التزاماتك',
          paragraphs: [
            'تجهّز المكان بالوقت المحجوز وتقدّم الخدمة زي ما هي معروضة، وتحافظ على سلامة اللاعبين، وتلتزم بالتراخيص والقوانين المطلوبة لمكانك.',
            'تحدّث ساعات الدوام والإغلاقات أول بأول عشان ما ينحجز وقت مش متاح.',
            'ما تطلب من اللاعبين يدفعوا خارج المنصة عن حجوزات عملوها عبرها، وما تستخدم بياناتهم لغير الحجز.',
          ],
        },
        {
          heading: 'فريق الملعب',
          paragraphs: [
            'بتقدر تضيف فريقك وتحدد دور كل واحد. إنت مسؤول عن أي إشي بيعمله فريقك بلوحة الملعب.',
          ],
        },
        {
          heading: 'الإيقاف وإنهاء الاتفاق',
          paragraphs: [
            'بتقدر توقف أو تأرشف ملعبك بأي وقت بعد ما تخلص أو تلغي الحجوزات الجاية. بنقدر نوقف ملعب بيخالف هاي الشروط أو عليه شكاوي جدية، مع تحويل المستحقات اللي صارت إلك حسب الأصول.',
          ],
        },
      ],
    },
    en: {
      title: 'Venue owner terms',
      description:
        'Terms for listing your venue on {appName}: commission, payouts and cancellations.',
      intro:
        'These terms apply to every organization or venue owner that registers on {appName}, in addition to the general terms and conditions. By submitting your venue for review you accept them.',
      sections: [
        {
          heading: 'Registration and review',
          paragraphs: [
            'You register your venue yourself: details, location, photos, courts, prices and opening hours. The {appName} team reviews it before players can see it, and may ask for changes or reject it with a reason.',
            'You are responsible for keeping all information accurate and up to date.',
          ],
        },
        {
          id: 'photos',
          heading: 'Photos',
          paragraphs: [
            'Upload only photos you have the rights to (you took them or have permission), showing your real venue as it is now. No photos of people without their permission.',
            'You give {appName} a free, non-exclusive permission to show, resize and crop the photos on the platform and in venue shares (such as WhatsApp links) while the venue is listed. When you delete a photo we stop showing it.',
            'Anyone can report a photo that breaks these rules. We review reports and may remove the photo.',
          ],
        },
        {
          id: 'payments',
          heading: 'Payment and commission',
          paragraphs: [
            'Players pay the full amount by card when they book, and {appName} collects it as the merchant. You do not collect any additional payment from players for bookings made on the platform.',
            '{appName} keeps a commission as a percentage of what the player paid (after any refund). The rate is shown in your venue dashboard under “Earnings”; any change applies to new bookings only.',
            'Bookings you add yourself (by phone or walk-in) carry no commission and do not go through {appName}.',
          ],
        },
        {
          id: 'payouts',
          heading: 'Payouts (earnings)',
          paragraphs: [
            'Every week (on Sunday) we transfer your net earnings for bookings played or ended in the previous week: what players paid, minus refunds, minus the commission.',
            'Payouts go to a Jordanian bank account (IBAN) in the name of the venue owner or organization. Only the owner can add or change it, and every change is logged. Until an account is added, earnings stay on hold.',
            'Under “Earnings” you can see each booking (paid, commission and your share) and every payout with its transfer reference.',
          ],
        },
        {
          id: 'cancellation',
          heading: 'Cancellations and refunds',
          paragraphs: [
            'You set the free-cancellation period and what players get back if they cancel late (nothing, half or the full amount). Each booking follows the rule in effect when it was made.',
            'If you cancel a booking for any reason, the player gets a full refund and you earn nothing from that booking. Frequent cancellations may affect your venue’s visibility or lead to suspension.',
            'If a player cancels late, the part not refunded to them counts toward your earnings (after commission). If a player does not show up, the full amount counts toward your earnings (after commission).',
          ],
        },
        {
          heading: 'Your obligations',
          paragraphs: [
            'Have the place ready at the booked time, provide the service as listed, keep players safe, and hold the licences and follow the laws that apply to your venue.',
            'Keep opening hours and closures up to date so unavailable times cannot be booked.',
            'Do not ask players to pay outside the platform for bookings made on it, and do not use their details for anything other than the booking.',
          ],
        },
        {
          heading: 'Your team',
          paragraphs: [
            'You can add your team and choose each member’s role. You are responsible for what your team does in the venue dashboard.',
          ],
        },
        {
          heading: 'Suspension and ending the agreement',
          paragraphs: [
            'You can pause or archive your venue at any time after upcoming bookings are completed or cancelled. We may suspend a venue that breaks these terms or has serious complaints, and will still pay out earnings it is owed.',
          ],
        },
      ],
    },
  },

  privacy: {
    ar: {
      title: 'سياسة الخصوصية',
      description: 'شو المعلومات اللي بنجمعها بـ{appName}، ليش، مع مين بنشاركها، وشو حقوقك.',
      intro:
        'بنجمع بس المعلومات اللي بنحتاجها عشان تحجز وتدفع وتتواصل مع الملعب، وبنتعامل معها حسب قانون حماية البيانات الشخصية الأردني رقم 24 لسنة 2023. ما بنبيع بياناتك لحدا.',
      sections: [
        {
          heading: 'مين المسؤول عن بياناتك',
          paragraphs: [
            '{appName} هي المسؤولة عن بياناتك على المنصة. اسم الشركة ورقم تسجيلها وعنوانها وطرق التواصل معنا تحت بقسم «تواصل معنا بخصوص الخصوصية».',
          ],
        },
        {
          heading: 'شو بنجمع وليش',
          paragraphs: [
            'رقم موبايلك: عشان تسجّل دخول بكود، ونبعتلك رسائل حجوزاتك، والملعب يقدر يتواصل معك.',
            'اسمك (زي ما بدك يظهر): عشان الملعب يعرف مين حاجز.',
            'تأكيد إن عمرك 16 سنة أو أكثر عند التسجيل، و18 أو أكثر قبل الدفع بالبطاقة: بنسجّل التأكيد ووقته بس، مش تاريخ ميلادك.',
            'حجوزاتك وبلاغاتك: عشان نعرضها إلك ونتابعها.',
            'معلومات الدفع: نوع البطاقة وآخر 4 أرقام منها وحالة الدفع والاسترجاع. رقم البطاقة كامل ورمز الأمان بيدخلوا على صفحة مزوّد الدفع مباشرة، وإحنا ما بنشوفهم ولا بنخزنهم.',
            'موافقاتك: نسخة الشروط اللي وافقت عليها ووقتها، واختيارك لرسائل العروض. بنحتفظ فيها كإثبات.',
            'موقعك: بس إذا ضغطت «قريب مني» ووافقت عليه بالمتصفح، وبنستخدمه لحظتها عشان نرتّب الملاعب حسب القرب. ما بنخزّنه.',
            'معلومات تقنية بسيطة (عنوان الاتصال IP ونوع المتصفح) بسجلات الأمان: لحماية المنصة من الاحتيال والهجمات.',
            'ما بنستخدم أدوات تتبّع إعلانية، ولا تسجيل لحركتك عالصفحة، ولا خرائط حرارية.',
          ],
        },
        {
          heading: 'على أي أساس بنستخدمها',
          paragraphs: [
            'تنفيذ الاتفاق بينا (الحجز والدفع والاسترجاع ورسائل الحجز)، والالتزامات القانونية (زي السجلات المالية)، ومصلحتنا المشروعة بحماية المنصة. رسائل العروض بس بموافقتك، وبتقدر تسحبها بأي وقت.',
          ],
        },
        {
          heading: 'رسائل الـSMS والعروض',
          paragraphs: [
            'بنبعتلك كود الدخول (OTP) برسالة نصية، ورسائل عن حجوزاتك (تأكيد، إلغاء، استرجاع). هاي ضرورية للخدمة.',
            'رسائل العروض والأخبار بس إذا اخترتها بنفسك (الخيار مش معلّم مسبقًا). بتقدر توقفها بأي وقت من «حسابي».',
          ],
        },
        {
          heading: 'مع مين بنشارك',
          paragraphs: [
            'الملعب اللي حجزت فيه: اسمك ورقم موبايلك وتفاصيل الحجز، عشان يستقبلك ويتواصل معك.',
            'مزوّد الدفع والبنك: عشان ينفذوا الدفع والاسترجاع.',
            'مزوّد الرسائل: رقم موبايلك ونص الرسالة بس.',
            'مزوّد الاستضافة: خوادم بتخزّن المنصة وبياناتها، وممكن تكون خارج الأردن. بنختار مزوّدين ملتزمين بحماية البيانات، وبنقيّد وصولهم.',
            'الجهات الرسمية: إذا طلب القانون.',
            'الخريطة: إذا ضغطت «اعرض الخريطة» بس، متصفحك بيحمّل صور الخريطة من OpenFreeMap/OpenStreetMap، وهدول بيشوفوا عنوان الاتصال تبعك.',
          ],
        },
        {
          heading: 'قديش بنحتفظ بالمعلومات',
          paragraphs: [
            'معلومات حسابك: طول ما هو فعّال. لما تحذفه بنمسح اسمك ورقمك وإيميلك فورًا.',
            'سجلات الحجوزات والدفع والموافقات: المدة اللي بيطلبها القانون للسجلات المالية والمحاسبية، حتى بعد حذف الحساب، بس بدون ما تكون مربوطة باسمك أو رقمك.',
            'سجلات الأمان: لفترة محدودة لحماية المنصة.',
            'كود الدخول بيخلص خلال دقايق وما بنحتفظ فيه.',
          ],
        },
        {
          id: 'delete',
          heading: 'حقوقك',
          paragraphs: [
            'إلك الحق تعرف شو بنعرف عنك وتاخد نسخة منه، وتصحّحه، وتطلب حذفه، وتعترض على استخدامه أو تطلب تقييده، وتسحب موافقتك على رسائل العروض بأي وقت.',
            'حذف الحساب: من «حسابي» ← «احذف حسابي»، وبيصير فورًا (إلا إذا عندك حجز جاي، أو إنت صاحب ملعب لازم تسلّمه أو تأرشفه أول).',
            'باقي الطلبات (نسخة أو تصحيح أو اعتراض): من صفحة «تواصل معنا»، وبنرد خلال 30 يوم.',
            'إذا مش راضي عن ردّنا، بتقدر تقدّم شكوى للجهة الرسمية المختصة بحماية البيانات الشخصية بالأردن.',
          ],
        },
        {
          heading: 'الحماية وإبلاغك عن أي اختراق',
          paragraphs: [
            'الاتصال مشفّر (HTTPS)، والوصول لمعلوماتك داخل الفريق محدود بالأشخاص اللي بيحتاجوها، وكل وصول حساس بينسجل، والنسخ الاحتياطية مشفّرة.',
            'إذا صار اختراق ممكن يأثر على بياناتك، بنبلّغ الجهة المختصة وبنبلّغك إنت بأسرع وقت، وبنحكيلك شو صار وشو عملنا وشو بتقدر تعمل.',
          ],
        },
        {
          heading: 'الأطفال',
          paragraphs: [
            'المنصة لمين عمره 16 سنة أو أكثر، والدفع بالبطاقة لمين عمره 18 أو أكثر. إذا عرفنا إنه في حساب لحدا أصغر، بنحذفه.',
          ],
        },
        {
          heading: 'التعديلات',
          paragraphs: [
            'ممكن نعدّل هاي السياسة، وبنحدّث تاريخ «آخر تحديث» تحت. إذا التعديل مهم بنبلّغك قبل ما يصير ساري.',
          ],
        },
      ],
    },
    en: {
      title: 'Privacy policy',
      description: 'What {appName} collects, why, who we share it with, and your rights.',
      intro:
        'We collect only what we need for you to book, pay and reach the venue, and we handle it under Jordan’s Personal Data Protection Law No. 24 of 2023. We never sell your data.',
      sections: [
        {
          heading: 'Who is responsible for your data',
          paragraphs: [
            '{appName} is responsible for your data on the platform. Our company name, registration number, address and contact details are below under “Contact us about privacy”.',
          ],
        },
        {
          heading: 'What we collect and why',
          paragraphs: [
            'Your mobile number: to sign you in with a code, text you about your bookings, and let the venue reach you.',
            'Your name (as you want it shown): so the venue knows who booked.',
            'Confirmation that you are 16 or older at sign-up, and 18 or older before paying by card: we record the confirmation and when, not your date of birth.',
            'Your bookings and reports: to show them to you and follow up.',
            'Payment details: your card brand, its last 4 digits and the payment and refund status. Your full card number and security code are entered directly on the payment provider’s page; we never see or store them.',
            'Your consents: the version of the terms you accepted and when, and your choice about offers. We keep these as proof.',
            'Your location: only if you tap “Near me” and allow it in your browser. We use it at that moment to sort venues by distance and do not store it.',
            'Basic technical data (IP address and browser type) in security logs, to protect the platform against fraud and attacks.',
            'We use no advertising trackers, no session recording and no heatmaps.',
          ],
        },
        {
          heading: 'Our legal basis',
          paragraphs: [
            'Performing our agreement with you (booking, payment, refunds and booking messages), our legal obligations (such as financial records), and our legitimate interest in keeping the platform safe. Offers are sent only with your consent, which you can withdraw at any time.',
          ],
        },
        {
          heading: 'Text messages (SMS) and offers',
          paragraphs: [
            'We text you your sign-in code (OTP) and messages about your bookings (confirmation, cancellation, refund). These are needed for the service.',
            'Offers and news only if you choose them yourself (the option is never pre-ticked). You can stop them at any time from “My account”.',
          ],
        },
        {
          heading: 'Who we share it with',
          paragraphs: [
            'The venue you booked: your name, mobile number and booking details, so it can receive and contact you.',
            'The payment provider and bank: to process payments and refunds.',
            'The SMS provider: your mobile number and the message text only.',
            'Our hosting provider: the servers that run the platform and store its data, which may be outside Jordan. We choose providers committed to data protection and limit their access.',
            'Authorities: when required by law.',
            'Maps: only if you tap “Show map”, your browser loads map images from OpenFreeMap/OpenStreetMap, which see your IP address.',
          ],
        },
        {
          heading: 'How long we keep it',
          paragraphs: [
            'Your account information: while your account is active. When you delete it we erase your name, number and email at once.',
            'Booking, payment and consent records: for as long as the law requires for financial and accounting records, even after you delete your account, but no longer linked to your name or number.',
            'Security logs: for a limited period to protect the platform.',
            'Sign-in codes expire within minutes and are not kept.',
          ],
        },
        {
          id: 'delete',
          heading: 'Your rights',
          paragraphs: [
            'You have the right to know what we hold about you and get a copy, to correct it, to ask for it to be deleted, to object to or restrict its use, and to withdraw your consent to offers at any time.',
            'Deleting your account: from “My account” → “Delete my account”. It happens at once (unless you have an upcoming booking, or you own a venue that must first be handed over or archived).',
            'Other requests (a copy, a correction or an objection): from the “Contact us” page. We reply within 30 days.',
            'If you are not satisfied with our reply, you can complain to the Jordanian authority responsible for personal data protection.',
          ],
        },
        {
          heading: 'Security and breach notices',
          paragraphs: [
            'Connections are encrypted (HTTPS), access to your information within our team is limited to those who need it, sensitive access is logged, and backups are encrypted.',
            'If a breach could affect your data, we notify the competent authority and you as soon as possible, and tell you what happened, what we did and what you can do.',
          ],
        },
        {
          heading: 'Children',
          paragraphs: [
            'The platform is for people 16 or older, and paying by card is for people 18 or older. If we learn an account belongs to someone younger, we delete it.',
          ],
        },
        {
          heading: 'Changes',
          paragraphs: [
            'We may change this policy and will update the “last updated” date below. If a change is significant we tell you before it takes effect.',
          ],
        },
      ],
    },
  },

  refunds: {
    ar: {
      title: 'سياسة الإلغاء والاسترجاع',
      description: 'إمتى وقديش بيرجعلك إذا ألغيت حجز على {appName}، وكيف بيوصلك المبلغ.',
      intro:
        'قاعدة الإلغاء لكل ملعب بتظهرلك قبل ما تدفع وبصفحة الحجز. القاعدة اللي بتنطبق هي اللي كانت وقت ما حجزت، حتى لو الملعب غيّرها بعدين.',
      sections: [
        {
          heading: 'إذا إنت ألغيت',
          paragraphs: [
            'خلال مدة الإلغاء المجاني (كل ملعب بيحددها، مثلًا 24 ساعة قبل الموعد): بيرجعلك المبلغ كامل.',
            'بعد ما تخلص مدة الإلغاء المجاني: بيرجعلك حسب قاعدة الملعب، يا ولا إشي، يا نص المبلغ، يا المبلغ كامل.',
            'إذا ما إجيت بدون ما تلغي: ما بيرجعلك إشي.',
          ],
        },
        {
          heading: 'إذا الملعب أو {appName} ألغى',
          paragraphs: [
            'إذا الملعب لغى حجزك لأي سبب، أو {appName} لغته (مثلًا الملعب انوقف)، بيرجعلك المبلغ كامل دايمًا.',
            'إذا دفعتك وصلت بعد ما خلص وقت حجز الموعد المؤقت وما قدرنا نثبّت الحجز، بيرجعلك المبلغ كامل تلقائيًا.',
          ],
        },
        {
          heading: 'كيف ومتى بيرجع المبلغ',
          paragraphs: [
            'المبلغ بيرجع على نفس البطاقة اللي دفعت فيها، ما في استرجاع كاش أو لحساب ثاني.',
            'إحنا بنبعت الاسترجاع للبنك فورًا وقت الإلغاء، وعادةً بيوصل لبطاقتك خلال 5–10 أيام عمل حسب البنك.',
            'بيوصلك رسالة بالمبلغ المسترجع، وبتشوفه بصفحة الحجز.',
          ],
        },
        {
          heading: 'مشكلة بالملعب؟',
          paragraphs: [
            'إذا وصلت ولقيت الملعب مسكّر أو مش جاهز، بلّغنا من «بلّغ عن مشكلة» بنفس اليوم، وفريقنا بيتابع مع الملعب. إذا ثبت إن الحجز ما انقدّم، بيرجعلك المبلغ كامل.',
          ],
        },
      ],
    },
    en: {
      title: 'Cancellation and refund policy',
      description:
        'When and how much you get back if you cancel a booking on {appName}, and how the money reaches you.',
      intro:
        'Each venue’s cancellation rule is shown before you pay and on your booking. The rule that applies is the one in effect when you booked, even if the venue changes it later.',
      sections: [
        {
          heading: 'If you cancel',
          paragraphs: [
            'Within the free-cancellation period (set by each venue, e.g. 24 hours before the start): full refund.',
            'After the free-cancellation period: refunded according to the venue’s rule, either nothing, half, or the full amount.',
            'If you do not show up and did not cancel: nothing is refunded.',
          ],
        },
        {
          heading: 'If the venue or {appName} cancels',
          paragraphs: [
            'If the venue cancels your booking for any reason, or {appName} cancels it (for example because the venue was suspended), you always get a full refund.',
            'If your payment arrives after the temporary hold on the time has expired and we cannot confirm the booking, you get a full refund automatically.',
          ],
        },
        {
          heading: 'How and when the money comes back',
          paragraphs: [
            'Refunds go back to the card you paid with only, never in cash or to another account.',
            'We send the refund to the bank as soon as the booking is cancelled; it usually reaches your card within 5–10 business days, depending on your bank.',
            'You get a text message with the refunded amount, and you can see it on your booking.',
          ],
        },
        {
          heading: 'A problem at the venue?',
          paragraphs: [
            'If you arrive and the venue is closed or not ready, report it the same day from “Report a problem” and our team will follow up with the venue. If the booking was not provided, you get a full refund.',
          ],
        },
      ],
    },
  },

  cookies: {
    ar: {
      title: 'سياسة ملفات تعريف الارتباط (الكوكيز)',
      description: 'شو الكوكيز اللي بيستخدمها {appName} وليش.',
      intro:
        'بنستخدم بس الكوكيز الضرورية عشان المنصة تشتغل. ما في كوكيز إعلانية ولا تحليلات ولا تتبّع من جهات ثانية، وعشان هيك ما بنطلب منك موافقة.',
      sections: [
        {
          heading: 'الكوكيز اللي بنستخدمها',
          paragraphs: [
            'js_session: بتخليك مسجّل دخول. بتنحفظ 30 يوم أو لحد ما تطلع من حسابك. آمنة (HttpOnly وSecure) وما بتقدر أي صفحة تقراها.',
            'js_admin_session وjs_admin_device: للوحة الإدارة وفريقنا بس، وما بتنحط عند اللاعبين.',
          ],
        },
        {
          heading: 'تخزين على جهازك',
          paragraphs: [
            'بنحفظ على جهازك (localStorage) إذا سكّرت اقتراح «ثبّت التطبيق» وعدد زياراتك، عشان ما نزعجك فيه. ما بيوصلنا إشي منه.',
          ],
        },
        {
          heading: 'التحكم فيها',
          paragraphs: [
            'بتقدر تمسح الكوكيز من إعدادات متصفحك، بس رح تطلع من حسابك. إذا بيوم أضفنا كوكيز مش ضرورية، رح نطلب موافقتك أول، وبيكون الرفض سهل زي القبول.',
          ],
        },
      ],
    },
    en: {
      title: 'Cookie policy',
      description: 'Which cookies {appName} uses and why.',
      intro:
        'We use only the cookies the platform needs to work. There are no advertising, analytics or third-party tracking cookies, so we do not ask for consent.',
      sections: [
        {
          heading: 'Cookies we use',
          paragraphs: [
            'js_session: keeps you signed in. Kept for 30 days or until you sign out. Secure (HttpOnly and Secure) and unreadable by any page script.',
            'js_admin_session and js_admin_device: for our team’s admin panel only; never set for players.',
          ],
        },
        {
          heading: 'Storage on your device',
          paragraphs: [
            'We store on your device (localStorage) whether you closed the “Install the app” suggestion and your visit count, so we do not nag you. None of it is sent to us.',
          ],
        },
        {
          heading: 'Your control',
          paragraphs: [
            'You can clear cookies in your browser settings, but you will be signed out. If we ever add non-essential cookies, we will ask for your consent first, and rejecting will be as easy as accepting.',
          ],
        },
      ],
    },
  },

  howItWorks: {
    ar: {
      title: 'كيف بتشتغل {appName}',
      description: 'احجز وادفع بالبطاقة بدقايق، والإلغاء والاسترجاع واضحين من الأول.',
      sections: [
        {
          heading: 'بثلاث خطوات',
          paragraphs: [
            '1. دوّر: اختار الرياضة والمنطقة واليوم، وشوف الأوقات الفاضية بكل الملاعب.',
            '2. احجز: اختار الوقت واضغط احجز. بنحجزلك الوقت كم دقيقة لحد ما تدفع.',
            '3. ادفع: ادفع المبلغ كامل بالبطاقة على صفحة الدفع الآمنة، وبيوصلك تأكيد برسالة. ورجي رقم الحجز بالملعب.',
          ],
        },
        {
          id: 'faq',
          heading: 'أسئلة بتتكرر',
          paragraphs: [],
          faq: [
            {
              q: 'كيف بدفع؟',
              a: 'بالبطاقة (فيزا أو ماستركارد) وقت الحجز، المبلغ كامل. ما في دفع بالملعب ولا عربون.',
            },
            {
              q: 'هل رقم بطاقتي بيتخزن عندكم؟',
              a: 'لا. بتدفع على صفحة مزوّد الدفع الآمنة، وإحنا بنعرف بس نوع البطاقة وآخر 4 أرقام.',
            },
            {
              q: 'مين بيستلم المبلغ؟',
              a: '{appName} بتستلمه، وبتحوّل للملعب حصته كل أسبوع بعد ما تخصم عمولتها.',
            },
            {
              q: 'كيف بلغي حجز؟',
              a: 'من «حجوزاتي» افتح الحجز واضغط «إلغاء الحجز». قبل ما تأكد بنقلك قديش رح يرجعلك.',
            },
            {
              q: 'قديش بيرجعلي إذا ألغيت؟',
              a: 'إذا ألغيت خلال مدة الإلغاء المجاني بيرجعلك المبلغ كامل. بعدها حسب قاعدة الملعب: ولا إشي، نص المبلغ، أو كامل. المدة والقاعدة بيظهروا قبل ما تدفع.',
            },
            {
              q: 'وإذا الملعب لغى حجزي؟',
              a: 'بيرجعلك المبلغ كامل دايمًا، وبيوصلك إشعار برسالة.',
            },
            {
              q: 'إمتى بيوصل المبلغ المسترجع؟',
              a: 'بنبعته على بطاقتك فورًا، وعادةً بيبين بحسابك خلال 5–10 أيام عمل حسب البنك.',
            },
            {
              q: 'الدفع ما زبط، شو أعمل؟',
              a: 'ما انخصم منك إشي والحجز ما تأكد. جرّب كمان مرة أو ببطاقة ثانية قبل ما يخلص وقت الحجز المؤقت.',
            },
            {
              q: 'عندي ملعب، كيف بسجّله؟',
              a: 'من «سجّل ملعبك» بتعبّي المعلومات والصور والأسعار، وبنراجعه خلال 24 ساعة. شوف «شروط أصحاب الملاعب».',
            },
          ],
        },
      ],
    },
    en: {
      title: 'How {appName} works',
      description:
        'Book and pay by card in minutes, with clear cancellation and refunds from the start.',
      sections: [
        {
          heading: 'In three steps',
          paragraphs: [
            '1. Search: pick the sport, area and day, and see free times across venues.',
            '2. Book: pick a time and tap Book. We hold it for you for a few minutes while you pay.',
            '3. Pay: pay the full amount by card on the secure payment page and get a confirmation by text. Show your booking reference at the venue.',
          ],
        },
        {
          id: 'faq',
          heading: 'Frequently asked questions',
          paragraphs: [],
          faq: [
            {
              q: 'How do I pay?',
              a: 'By card (Visa or Mastercard) when you book, the full amount. There is no paying at the venue and no deposit.',
            },
            {
              q: 'Do you store my card number?',
              a: 'No. You pay on the payment provider’s secure page; we only know the card brand and its last 4 digits.',
            },
            {
              q: 'Who receives the money?',
              a: '{appName} does, and pays the venue its share every week after keeping its commission.',
            },
            {
              q: 'How do I cancel?',
              a: 'Open the booking from “My bookings” and tap “Cancel booking”. Before you confirm, we show how much you will get back.',
            },
            {
              q: 'How much do I get back if I cancel?',
              a: 'Within the free-cancellation period, the full amount. After it, the venue’s rule applies: nothing, half or the full amount. Both are shown before you pay.',
            },
            {
              q: 'What if the venue cancels?',
              a: 'You always get a full refund, and we text you.',
            },
            {
              q: 'When does a refund arrive?',
              a: 'We send it to your card right away; it usually shows in your account within 5–10 business days, depending on your bank.',
            },
            {
              q: 'My payment failed. What now?',
              a: 'You were not charged and the booking is not confirmed. Try again, or with another card, before the hold runs out.',
            },
            {
              q: 'I own a venue. How do I list it?',
              a: 'Use “Register your venue” to add details, photos and prices; we review it within 24 hours. See the “Venue owner terms”.',
            },
          ],
        },
      ],
    },
  },
};
