"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
};

const STORAGE_KEY = "queueless.locale";
const LOCALE_CHANGED_EVENT = "queueless:locale-changed";

/** Last locale chosen in this tab; fallback when localStorage is unavailable. */
let memoryLocale: Locale = "en";

/** English is the source of truth; every other locale must match its keys. */
const en = {
  "brand.tagline": "Smart Hospital Flow",

  "nav.liveOpds": "Live OPDs",
  "nav.howItWorks": "How It Works",
  "nav.features": "Features",
  "nav.checkToken": "Check My Token",
  "nav.staff": "Staff",
  "nav.admin": "Admin",

  "common.backHome": "← Back to Home",
  "common.checkToken": "Check My Token →",
  "common.refresh": "↻ Refresh",
  "common.refreshing": "Refreshing...",
  "common.retry": "Retry",
  "common.minutes": "min",
  "common.print": "🖨️ Print token slip",
  "common.loading": "Loading...",
  "common.you": "You",

  "home.systemOnline": "Hospital System Online",
  "home.getToken": "Get My Token →",

  "hero.badge": "Live OPD Wait-Time Transparency",
  "hero.title1": "Know the queue",
  "hero.title2": "before you arrive.",
  "hero.subtitle":
    "QueueLess provides real-time visibility into hospital outpatient departments, doctor availability, live patient queues, and estimated wait times. No more standing blindly in crowded waiting rooms.",
  "hero.ctaPrimary": "Get My Digital Token →",
  "hero.ctaSecondary": "Track Existing Token",

  "metrics.activeOpds": "Active OPDs",
  "metrics.specialists": "Specialists",
  "metrics.waiting": "Patients Waiting",
  "metrics.avgWait": "Avg. Queue Wait",
  "metrics.accepting": "Accepting patients",
  "metrics.onDuty": "On duty today",
  "metrics.acrossAll": "Across all OPDs",
  "metrics.currentAverage": "Current hospital average",

  "live.kicker": "Live Hospital Database",
  "live.title": "Current OPD Queue & Availability",
  "live.description":
    "Real-time queue loads directly from the hospital database. To protect patient confidentiality, personal tokens and names are only visible on your private verified queue dashboard.",
  "live.updated": "Updated {time}",
  "live.fetching": "Fetching live data...",

  "error.offlineTitle": "⚠️ Queue Server Offline",
  "error.offlineDescription":
    "FastAPI backend is currently unreachable at {url}. Please start the backend server to view live data.",

  "card.opdDept": "OPD Department",
  "card.attending": "Attending Specialist",
  "card.inQueue": "In Queue",
  "card.patientWaiting": "patient waiting",
  "card.patientsWaiting": "patients waiting",
  "card.estWait": "Est. Wait",
  "card.approximate": "approximate",
  "card.nowServing": "Now Serving",
  "card.noneActive": "None active",
  "card.opdHours": "OPD Hours",
  "card.noOpds": "No OPD records currently active.",

  "status.available": "Available",
  "status.busy": "Busy",
  "status.onBreak": "Doctor on Break",
  "wait.noWait": "No wait",

  "how.kicker": "Transparent Patient Flow",
  "how.stepLabel": "STEP {number}",
  "how.title": "Public transparency first. Private queue after verification.",
  "how.step1.title": "Check OPD Availability",
  "how.step1.description":
    "Explore real-time queues, assigned doctors, and estimated wait times before stepping out of your house.",
  "how.step2.title": "Verify Mobile & Register",
  "how.step2.description":
    "Verify your 10-digit phone number with an OTP to prevent fraudulent entries and generate your department token.",
  "how.step3.title": "Track Live Queue Position",
  "how.step3.description":
    "Watch your live queue position, see how many patients are ahead, and know exactly when to head to the consultation room.",

  "features.kicker": "Built for Modern Healthcare",
  "features.title": "Engineered for realistic hospital flow.",
  "features.description":
    "QueueLess blends patient-facing convenience with hospital staff operational support, priority management, and bottleneck visibility.",
  "features.tokens.title": "Department-Aware Tokens",
  "features.tokens.description":
    "Tokens are sequential and isolated per department, restarting every hospital day. Every registration is recorded directly in the database as the single source of truth.",
  "features.priority.title": "Priority-Aware Scheduling",
  "features.priority.description":
    "Emergency, elderly, and pregnant cases are prioritized based on hospital workflow rules, avoiding naive first-come-first-served bottlenecks.",
  "features.wait.title": "Transparent Wait Estimation",
  "features.wait.description":
    "Clear calculations based on active patients ahead and standard consultation durations, with no hidden guesswork.",
  "features.privacy.title": "Privacy-First Design",
  "features.privacy.description":
    "Public screens display only operational statistics. Medical reasons, personal names, and private tokens are strictly protected.",
  "features.staff.title": "Staff Queue Control",
  "features.staff.description":
    "Authorized doctors and attendants can call, consult, complete, skip, or requeue patients with full traceability across all transitions.",
  "features.insights.title": "Hospital Operational Insights",
  "features.insights.description":
    "Track queue arrival velocities, peak congestion hours, and doctor utilization to optimize resource allocations.",

  "cta.kicker": "Skip The Physical Line",
  "cta.title": "Ready to get your OPD token?",
  "cta.description":
    "Verify your mobile number, select your department, and monitor your turn from your phone. Arrive when your doctor is ready.",
  "cta.primary": "Get My Token Now →",
  "cta.secondary": "Track Existing Token",

  "footer.tagline": "Intelligent Hospital Queue & Patient Flow System",
  "footer.home": "Home",
  "footer.check": "Check Token",
  "footer.get": "Get Token",
  "footer.doctor": "Doctor Console",

  "verify.title": "Verify Your Mobile",
  "verify.subtitle":
    "Verify your mobile number before getting your hospital queue token.",
  "verify.mobileLabel": "Mobile Number",
  "verify.sendHint": "We'll send a verification code to this number.",
  "verify.sendOtp": "Send OTP",
  "verify.sending": "Sending OTP...",
  "verify.sentTo": "OTP sent to +91 {phone}",
  "verify.devOtp": "Prototype OTP: {code}",
  "verify.checkMessages": "Check your messages for the 6-digit code.",
  "verify.otpLabel": "Enter OTP",
  "verify.otpPlaceholder": "Enter 6-digit OTP",
  "verify.verify": "Verify & Continue",
  "verify.verifying": "Verifying...",
  "verify.resendIn": "Resend OTP in {seconds}s",
  "verify.resend": "Resend OTP",
  "verify.changeNumber": "Change Mobile Number",
  "verify.sentNotice": "OTP sent successfully. It expires in 5 minutes.",
  "verify.security": "🔒 Your mobile number is securely handled by QueueLess.",
  "verify.errorPhone": "Please enter a valid 10-digit mobile number.",
  "verify.errorSend": "Could not send the OTP. Please try again.",
  "verify.errorVerify": "Verification failed. Please try again.",
  "verify.errorEnterOtp": "Please enter the OTP.",
  "verify.errorUnreachable":
    "Unable to reach the QueueLess server. Please try again.",

  "register.title": "Get Your Token",
  "register.subtitle":
    "Your mobile number has been verified. Complete your details to join the queue.",
  "register.verified": "Mobile Verified",
  "register.nameLabel": "Full Name",
  "register.namePlaceholder": "Enter your full name",
  "register.ageLabel": "Age",
  "register.agePlaceholder": "Age",
  "register.departmentLabel": "Department",
  "register.departmentPlaceholder": "Select department",
  "register.priorityLabel": "Priority",
  "register.priorityNote":
    "Priority should follow the hospital's authorized workflow rules.",
  "register.symptomsLabel": "Symptoms",
  "register.optional": "(Optional)",
  "register.symptomsPlaceholder": "Describe your symptoms briefly",
  "register.submit": "Get My Token",
  "register.submitting": "Creating your token...",
  "register.linkNote":
    "Your verified mobile number will be linked to this queue registration.",
  "register.security": "🔒 Your information is securely handled by QueueLess.",
  "register.errorName": "Please enter your name.",
  "register.errorAge": "Please enter your age.",
  "register.errorAgeValid": "Please enter a valid age.",
  "register.errorDepartment": "Please select a department.",
  "register.errorGeneric":
    "Unable to create your token. Please make sure the QueueLess server is running.",

  "dept.general": "General Medicine",
  "dept.dental": "Dental",
  "dept.cardiology": "Cardiology",
  "dept.gastro": "Gastroenterology",
  "dept.orthopedics": "Orthopedics",
  "dept.neurology": "Neurology",

  "priority.regular": "Regular",
  "priority.emergency": "Emergency",
  "priority.elderly": "Elderly",
  "priority.pregnant": "Pregnant",
  "priority.follow_up": "Follow-up",

  "check.title": "Check Your Token",
  "check.kicker": "Patient Queue Lookup",
  "check.subtitle":
    "Enter the 10-digit mobile number you used during OPD registration.",
  "check.phoneLabel": "Mobile Number",
  "check.submit": "Find My Queue Status →",
  "check.searching": "Searching Records...",
  "check.notFound":
    "No active record found for this mobile number. Would you like to get a new token?",
  "check.registerNow": "Register for an OPD token now →",
  "check.newHere": "New to the hospital today?",
  "check.getNew": "Get a new token",
  "check.security":
    "🔒 Only verified records matching your registered mobile number are accessible. Private medical information is never publicly displayed.",

  "queue.title": "Your Queue",
  "queue.subtitle": "Track your position while you wait.",
  "queue.yourToken": "Your Token",
  "queue.departmentSuffix": "{department} Department",
  "queue.patient": "Patient",
  "queue.status": "Status",
  "queue.priority": "Priority",
  "queue.liveQueue": "Live Queue",
  "queue.positionTitle": "Your Current Position",
  "queue.live": "LIVE",
  "queue.currentlyServing": "Currently Serving",
  "queue.patientsAhead": "Patients Ahead",
  "queue.yourPosition": "Your Position",
  "queue.estWait": "Estimated Wait",
  "queue.liveMessage": "Queue is live",
  "queue.autoRefresh": "Your queue information automatically refreshes every 5 seconds.",
  "queue.updated": "Updated {time}",
  "queue.registrationDetails": "Registration Details",
  "queue.age": "Age",
  "queue.phone": "Phone",
  "queue.security": "🔒 Your queue information is securely handled by QueueLess.",
  "queue.leave": "Leave queue",
  "queue.cancelQuestion": "Cancel this token?",
  "queue.yesLeave": "Yes, leave queue",
  "queue.keepWaiting": "Keep waiting",
  "queue.cancelling": "Cancelling...",
  "queue.newToken": "Get a new token →",
  "queue.completedTitle": "Visit completed",
  "queue.completedDescription":
    "Your consultation is finished. Take care, and follow any advice given by the doctor.",
  "queue.cancelledTitle": "Token cancelled",
  "queue.skippedTitle": "Token skipped",
  "queue.inactiveDescription":
    "This token is no longer active. You can register for a new token at any time.",
  "queue.errorLoad": "Unable to load your queue information.",
  "queue.errorUnavailable": "Queue information unavailable",
  "queue.errorPatientMissing": "Patient information could not be found.",
  "queue.loading": "Loading your queue...",
  "queue.slip.kicker": "QueueLess · OPD Token Slip",
  "queue.slip.patient": "Patient",
  "queue.slip.age": "Age",
  "queue.slip.mobile": "Mobile",
  "queue.slip.priority": "Priority",
  "queue.slip.printed": "Printed",
  "queue.slip.note":
    "Keep this slip with you. Your queue position is shown on the QueueLess dashboard and refreshes every 5 seconds.",
  "queue.cancelFailed": "Could not cancel this token.",

  "status.waiting": "Waiting",
  "status.called": "Called",
  "status.consulting": "Consulting",
  "status.completed": "Completed",
  "status.skipped": "Skipped",
  "status.cancelled": "Cancelled",

  "language.label": "Language",
} as const;

export type TranslationKey = keyof typeof en;

const hi: Record<TranslationKey, string> = {
  "brand.tagline": "स्मार्ट अस्पताल प्रवाह",

  "nav.liveOpds": "लाइव OPD",
  "nav.howItWorks": "यह कैसे काम करता है",
  "nav.features": "विशेषताएँ",
  "nav.checkToken": "मेरा टोकन देखें",
  "nav.staff": "स्टाफ़",
  "nav.admin": "एडमिन",

  "common.backHome": "← होम पर वापस",
  "common.checkToken": "मेरा टोकन देखें →",
  "common.refresh": "↻ रीफ़्रेश",
  "common.refreshing": "रीफ़्रेश हो रहा है...",
  "common.retry": "पुनः प्रयास करें",
  "common.minutes": "मिनट",
  "common.print": "🖨️ टोकन पर्ची प्रिंट करें",
  "common.loading": "लोड हो रहा है...",
  "common.you": "आप",

  "home.systemOnline": "अस्पताल प्रणाली ऑनलाइन",
  "home.getToken": "मेरा टोकन लें →",

  "hero.badge": "लाइव OPD प्रतीक्षा-समय पारदर्शिता",
  "hero.title1": "कतार पहले से जानें,",
  "hero.title2": "पहुँचने से पहले।",
  "hero.subtitle":
    "QueueLess अस्पताल के ओपीडी विभागों, डॉक्टर की उपलब्धता, लाइव मरीज़ कतार और अनुमानित प्रतीक्षा समय की रीयल-टाइम जानकारी देता है। भीड़ भरे प्रतीक्षा कक्ष में खड़े रहने की ज़रूरत नहीं।",
  "hero.ctaPrimary": "मेरा डिजिटल टोकन लें →",
  "hero.ctaSecondary": "मौजूदा टोकन ट्रैक करें",

  "metrics.activeOpds": "सक्रिय OPD",
  "metrics.specialists": "विशेषज्ञ",
  "metrics.waiting": "प्रतीक्षारत मरीज़",
  "metrics.avgWait": "औसत कतार प्रतीक्षा",
  "metrics.accepting": "मरीज़ स्वीकार कर रहे हैं",
  "metrics.onDuty": "आज ड्यूटी पर",
  "metrics.acrossAll": "सभी OPD में",
  "metrics.currentAverage": "अस्पताल का वर्तमान औसत",

  "live.kicker": "लाइव अस्पताल डेटाबेस",
  "live.title": "वर्तमान OPD कतार और उपलब्धता",
  "live.description":
    "अस्पताल के डेटाबेस से सीधे रीयल-टाइम कतार की जानकारी। मरीज़ों की गोपनीयता के लिए व्यक्तिगत टोकन और नाम केवल आपके निजी सत्यापित कतार डैशबोर्ड पर दिखाई देते हैं।",
  "live.updated": "अपडेट {time}",
  "live.fetching": "लाइव डेटा प्राप्त हो रहा है...",

  "error.offlineTitle": "⚠️ कतार सर्वर ऑफ़लाइन",
  "error.offlineDescription":
    "FastAPI बैकएंड {url} पर उपलब्ध नहीं है। लाइव डेटा देखने के लिए कृपया बैकएंड सर्वर प्रारंभ करें।",

  "card.opdDept": "OPD विभाग",
  "card.attending": "उपस्थित विशेषज्ञ",
  "card.inQueue": "कतार में",
  "card.patientWaiting": "मरीज़ प्रतीक्षारत",
  "card.patientsWaiting": "मरीज़ प्रतीक्षारत",
  "card.estWait": "अनुमानित प्रतीक्षा",
  "card.approximate": "लगभग",
  "card.nowServing": "अभी सेवा में",
  "card.noneActive": "कोई सक्रिय नहीं",
  "card.opdHours": "OPD समय",
  "card.noOpds": "अभी कोई OPD सक्रिय नहीं है।",

  "status.available": "उपलब्ध",
  "status.busy": "व्यस्त",
  "status.onBreak": "डॉक्टर अवकाश पर",
  "wait.noWait": "प्रतीक्षा नहीं",

  "how.kicker": "पारदर्शी मरीज़ प्रवाह",
  "how.stepLabel": "चरण {number}",
  "how.title": "पहले सार्वजनिक पारदर्शिता। सत्यापन के बाद निजी कतार।",
  "how.step1.title": "OPD उपलब्धता देखें",
  "how.step1.description":
    "घर से निकलने से पहले रीयल-टाइम कतार, नियुक्त डॉक्टर और अनुमानित प्रतीक्षा समय देखें।",
  "how.step2.title": "मोबाइल सत्यापित करें और पंजीकरण करें",
  "how.step2.description":
    "धोखाधड़ी से बचने के लिए OTP से अपना 10-अंकीय मोबाइल नंबर सत्यापित करें और अपने विभाग का टोकन बनाएँ।",
  "how.step3.title": "लाइव कतार स्थिति ट्रैक करें",
  "how.step3.description":
    "अपनी लाइव कतार स्थिति देखें, जानें कि आपसे आगे कितने मरीज़ हैं, और ठीक समय पर परामर्श कक्ष पहुँचें।",

  "features.kicker": "आधुनिक स्वास्थ्य सेवा के लिए निर्मित",
  "features.title": "वास्तविक अस्पताल प्रवाह के लिए डिज़ाइन किया गया।",
  "features.description":
    "QueueLess मरीज़ों की सुविधा को अस्पताल स्टाफ़ के संचालन समर्थन, प्राथमिकता प्रबंधन और भीड़-स्थिति की जानकारी के साथ जोड़ता है।",
  "features.tokens.title": "विभाग-आधारित टोकन",
  "features.tokens.description":
    "टोकन क्रमिक होते हैं और प्रत्येक विभाग के लिए अलग रखे जाते हैं, तथा हर अस्पताल दिवस पर नए सिरे से शुरू होते हैं। प्रत्येक पंजीकरण सीधे डेटाबेस में दर्ज होता है।",
  "features.priority.title": "प्राथमिकता-आधारित कतार",
  "features.priority.description":
    "आपातकाल, वरिष्ठ नागरिक और गर्भवती मामलों को अस्पताल के कार्यप्रवाह नियमों के अनुसार प्राथमिकता दी जाती है, जिससे सिर्फ़ पहले-आओ-पहले-पाओ वाली भीड़ नहीं बनती।",
  "features.wait.title": "पारदर्शी प्रतीक्षा अनुमान",
  "features.wait.description":
    "आगे मौजूद मरीज़ों और मानक परामर्श अवधि के आधार पर स्पष्ट गणना, बिना किसी छिपे अनुमान के।",
  "features.privacy.title": "गोपनीयता-प्रथम डिज़ाइन",
  "features.privacy.description":
    "सार्वजनिक स्क्रीन केवल संचालन संबंधी आँकड़े दिखाती हैं। चिकित्सीय कारण, व्यक्तिगत नाम और निजी टोकन पूरी तरह सुरक्षित रहते हैं।",
  "features.staff.title": "स्टाफ़ कतार नियंत्रण",
  "features.staff.description":
    "अधिकृत डॉक्टर और सहायक मरीज़ों को बुला सकते हैं, परामर्श शुरू कर सकते हैं, पूरा कर सकते हैं, छोड़ सकते हैं या फिर से कतार में डाल सकते हैं।",
  "features.insights.title": "अस्पताल संचालन अंतर्दृष्टि",
  "features.insights.description":
    "संसाधन आवंटन बेहतर करने के लिए कतार आगमन गति, व्यस्ततम घंटे और डॉक्टर उपयोगिता ट्रैक करें।",

  "cta.kicker": "शारीरिक कतार छोड़ें",
  "cta.title": "अपना OPD टोकन लेने के लिए तैयार हैं?",
  "cta.description":
    "अपना मोबाइल नंबर सत्यापित करें, विभाग चुनें और अपने फ़ोन से अपनी बारी देखें। जब डॉक्टर तैयार हों तब पहुँचें।",
  "cta.primary": "अभी मेरा टोकन लें →",
  "cta.secondary": "मौजूदा टोकन ट्रैक करें",

  "footer.tagline": "बुद्धिमान अस्पताल कतार और मरीज़ प्रवाह प्रणाली",
  "footer.home": "होम",
  "footer.check": "टोकन देखें",
  "footer.get": "टोकन लें",
  "footer.doctor": "डॉक्टर कंसोल",

  "verify.title": "अपना मोबाइल सत्यापित करें",
  "verify.subtitle":
    "अस्पताल कतार टोकन पाने से पहले अपना मोबाइल नंबर सत्यापित करें।",
  "verify.mobileLabel": "मोबाइल नंबर",
  "verify.sendHint": "हम इस नंबर पर एक सत्यापन कोड भेजेंगे।",
  "verify.sendOtp": "OTP भेजें",
  "verify.sending": "OTP भेजा जा रहा है...",
  "verify.sentTo": "+91 {phone} पर OTP भेजा गया",
  "verify.devOtp": "प्रोटोटाइप OTP: {code}",
  "verify.checkMessages": "6-अंकीय कोड के लिए अपने संदेश देखें।",
  "verify.otpLabel": "OTP दर्ज करें",
  "verify.otpPlaceholder": "6-अंकीय OTP दर्ज करें",
  "verify.verify": "सत्यापित करें और आगे बढ़ें",
  "verify.verifying": "सत्यापित हो रहा है...",
  "verify.resendIn": "{seconds} सेकंड में OTP फिर भेजें",
  "verify.resend": "OTP फिर भेजें",
  "verify.changeNumber": "मोबाइल नंबर बदलें",
  "verify.sentNotice": "OTP सफलतापूर्वक भेजा गया। यह 5 मिनट में समाप्त हो जाएगा।",
  "verify.security": "🔒 आपका मोबाइल नंबर QueueLess द्वारा सुरक्षित रूप से संभाला जाता है।",
  "verify.errorPhone": "कृपया 10-अंकीय मान्य मोबाइल नंबर दर्ज करें।",
  "verify.errorSend": "OTP भेजा नहीं जा सका। कृपया पुनः प्रयास करें।",
  "verify.errorVerify": "सत्यापन विफल रहा। कृपया पुनः प्रयास करें।",
  "verify.errorEnterOtp": "कृपया OTP दर्ज करें।",
  "verify.errorUnreachable":
    "QueueLess सर्वर से संपर्क नहीं हो सका। कृपया पुनः प्रयास करें।",

  "register.title": "अपना टोकन लें",
  "register.subtitle":
    "आपका मोबाइल नंबर सत्यापित हो गया है। कतार में जुड़ने के लिए अपना विवरण पूरा करें।",
  "register.verified": "मोबाइल सत्यापित",
  "register.nameLabel": "पूरा नाम",
  "register.namePlaceholder": "अपना पूरा नाम दर्ज करें",
  "register.ageLabel": "उम्र",
  "register.agePlaceholder": "उम्र",
  "register.departmentLabel": "विभाग",
  "register.departmentPlaceholder": "विभाग चुनें",
  "register.priorityLabel": "प्राथमिकता",
  "register.priorityNote":
    "प्राथमिकता अस्पताल के अधिकृत कार्यप्रवाह नियमों के अनुसार होनी चाहिए।",
  "register.symptomsLabel": "लक्षण",
  "register.optional": "(वैकल्पिक)",
  "register.symptomsPlaceholder": "अपने लक्षण संक्षेप में बताएँ",
  "register.submit": "मेरा टोकन लें",
  "register.submitting": "आपका टोकन बन रहा है...",
  "register.linkNote":
    "आपका सत्यापित मोबाइल नंबर इस कतार पंजीकरण से जोड़ा जाएगा।",
  "register.security": "🔒 आपकी जानकारी QueueLess द्वारा सुरक्षित रूप से संभाली जाती है।",
  "register.errorName": "कृपया अपना नाम दर्ज करें।",
  "register.errorAge": "कृपया अपनी उम्र दर्ज करें।",
  "register.errorAgeValid": "कृपया मान्य उम्र दर्ज करें।",
  "register.errorDepartment": "कृपया एक विभाग चुनें।",
  "register.errorGeneric":
    "आपका टोकन नहीं बन सका। कृपया सुनिश्चित करें कि QueueLess सर्वर चल रहा है।",

  "dept.general": "सामान्य चिकित्सा",
  "dept.dental": "दंत चिकित्सा",
  "dept.cardiology": "हृदय रोग",
  "dept.gastro": "जठरांत्र रोग",
  "dept.orthopedics": "अस्थि रोग",
  "dept.neurology": "तंत्रिका रोग",

  "priority.regular": "सामान्य",
  "priority.emergency": "आपातकाल",
  "priority.elderly": "वरिष्ठ नागरिक",
  "priority.pregnant": "गर्भवती",
  "priority.follow_up": "फ़ॉलो-अप",

  "check.title": "अपना टोकन देखें",
  "check.kicker": "मरीज़ कतार खोज",
  "check.subtitle":
    "OPD पंजीकरण के समय उपयोग किया गया 10-अंकीय मोबाइल नंबर दर्ज करें।",
  "check.phoneLabel": "मोबाइल नंबर",
  "check.submit": "मेरी कतार स्थिति देखें →",
  "check.searching": "रिकॉर्ड खोजे जा रहे हैं...",
  "check.notFound":
    "इस मोबाइल नंबर के लिए कोई सक्रिय रिकॉर्ड नहीं मिला। क्या आप नया टोकन लेना चाहेंगे?",
  "check.registerNow": "अभी OPD टोकन के लिए पंजीकरण करें →",
  "check.newHere": "आज अस्पताल में नए हैं?",
  "check.getNew": "नया टोकन लें",
  "check.security":
    "🔒 केवल आपके पंजीकृत मोबाइल नंबर से मेल खाने वाले सत्यापित रिकॉर्ड ही सुलभ हैं। निजी चिकित्सीय जानकारी कभी सार्वजनिक रूप से प्रदर्शित नहीं की जाती।",

  "queue.title": "आपकी कतार",
  "queue.subtitle": "प्रतीक्षा के दौरान अपनी स्थिति देखें।",
  "queue.yourToken": "आपका टोकन",
  "queue.departmentSuffix": "{department} विभाग",
  "queue.patient": "मरीज़",
  "queue.status": "स्थिति",
  "queue.priority": "प्राथमिकता",
  "queue.liveQueue": "लाइव कतार",
  "queue.positionTitle": "आपकी वर्तमान स्थिति",
  "queue.live": "लाइव",
  "queue.currentlyServing": "अभी सेवा में",
  "queue.patientsAhead": "आपसे आगे",
  "queue.yourPosition": "आपकी स्थिति",
  "queue.estWait": "अनुमानित प्रतीक्षा",
  "queue.liveMessage": "कतार लाइव है",
  "queue.autoRefresh": "आपकी कतार जानकारी हर 5 सेकंड में स्वतः अपडेट होती है।",
  "queue.updated": "अपडेट {time}",
  "queue.registrationDetails": "पंजीकरण विवरण",
  "queue.age": "उम्र",
  "queue.phone": "फ़ोन",
  "queue.security": "🔒 आपकी कतार जानकारी QueueLess द्वारा सुरक्षित रूप से संभाली जाती है।",
  "queue.leave": "कतार छोड़ें",
  "queue.cancelQuestion": "यह टोकन रद्द करें?",
  "queue.yesLeave": "हाँ, कतार छोड़ें",
  "queue.keepWaiting": "प्रतीक्षा जारी रखें",
  "queue.cancelling": "रद्द हो रहा है...",
  "queue.newToken": "नया टोकन लें →",
  "queue.completedTitle": "विज़िट पूरी हुई",
  "queue.completedDescription":
    "आपका परामर्श पूरा हो गया है। अपना ध्यान रखें और डॉक्टर की सलाह का पालन करें।",
  "queue.cancelledTitle": "टोकन रद्द हुआ",
  "queue.skippedTitle": "टोकन छोड़ा गया",
  "queue.inactiveDescription":
    "यह टोकन अब सक्रिय नहीं है। आप कभी भी नया टोकन ले सकते हैं।",
  "queue.errorLoad": "आपकी कतार जानकारी लोड नहीं हो सकी।",
  "queue.errorUnavailable": "कतार जानकारी उपलब्ध नहीं",
  "queue.errorPatientMissing": "मरीज़ की जानकारी नहीं मिली।",
  "queue.loading": "आपकी कतार लोड हो रही है...",
  "queue.slip.kicker": "QueueLess · OPD टोकन पर्ची",
  "queue.slip.patient": "मरीज़",
  "queue.slip.age": "उम्र",
  "queue.slip.mobile": "मोबाइल",
  "queue.slip.priority": "प्राथमिकता",
  "queue.slip.printed": "प्रिंट समय",
  "queue.slip.note":
    "यह पर्ची अपने पास रखें। आपकी कतार स्थिति QueueLess डैशबोर्ड पर दिखाई देती है और हर 5 सेकंड में अपडेट होती है।",
  "queue.cancelFailed": "यह टोकन रद्द नहीं हो सका।",

  "status.waiting": "प्रतीक्षारत",
  "status.called": "बुलाया गया",
  "status.consulting": "परामर्श जारी",
  "status.completed": "पूर्ण",
  "status.skipped": "छोड़ा गया",
  "status.cancelled": "रद्द",

  "language.label": "भाषा",
};

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, hi };

export const DEPARTMENT_KEYS: Record<string, TranslationKey> = {
  general: "dept.general",
  dental: "dept.dental",
  cardiology: "dept.cardiology",
  gastro: "dept.gastro",
  orthopedics: "dept.orthopedics",
  neurology: "dept.neurology",
};

export const VISIT_STATUS_KEYS: Record<string, TranslationKey> = {
  waiting: "status.waiting",
  called: "status.called",
  consulting: "status.consulting",
  completed: "status.completed",
  skipped: "status.skipped",
  cancelled: "status.cancelled",
};

export const PRIORITY_KEYS: Record<string, TranslationKey> = {
  regular: "priority.regular",
  emergency: "priority.emergency",
  elderly: "priority.elderly",
  pregnant: "priority.pregnant",
  follow_up: "priority.follow_up",
};

type Interpolations = Record<string, string | number>;

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Interpolations
): string {
  const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;

  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Interpolations) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

/** Reads the persisted locale; falls back to the in-memory value when storage is unavailable. */
function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    // localStorage can throw in private modes; the in-memory value still applies.
  }
  return memoryLocale;
}

function subscribeLocale(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LOCALE_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LOCALE_CHANGED_EVENT, onStoreChange);
  };
}

/**
 * Client provider. Renders in English on the server and during hydration,
 * then switches to the persisted locale via useSyncExternalStore so the first
 * client render matches the server HTML exactly.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore<Locale>(
    subscribeLocale,
    readStoredLocale,
    () => "en"
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    memoryLocale = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable in private modes; language still switches.
    }
    window.dispatchEvent(new Event(LOCALE_CHANGED_EVENT));
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);

  if (!context) {
    // Allows components to render outside the provider (e.g. in tests).
    return {
      locale: "en",
      setLocale: () => {},
      t: (key, vars) => translate("en", key, vars),
    };
  }

  return context;
}
