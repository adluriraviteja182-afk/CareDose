// Small dictionary: English, Hindi, Telugu. Add a language by adding a block and a SPEECH code.
export const LANGS = { en: "English", hi: "हिन्दी", te: "తెలుగు" };
export const SPEECH = { en: "en-IN", hi: "hi-IN", te: "te-IN" };

const D = {
  en: {
    today: "Today", medicines: "Medicines", chat: "Assistant", report: "Report", family: "Family", review: "Review",
    logout: "Log out", upcoming: "Coming up", adherence: "Adherence", missed: "Missed", taken: "Taken", points: "Points",
    streak: "Day streak", level: "Level", takeMedicine: "Take medicine", laterBtn: "Later", timeFor: "Time for your medicine",
    nothingToday: "No doses today. Add a medicine to get started.", diet: "Eat well", eat: "Eat", avoid: "Avoid",
    water: "Water reminders", askHint: "Ask about your schedule…", send: "Send", speak: "Speak", badges: "Badges",
    checkTablet: "Check tablet", tryAgain: "That doesn't look like the right tablet. Hold it closer and try again.",
    confirmManual: "Confirm without camera", verified: "Tablet matched. Dose marked as taken.",
    remindDrink: "Time to drink a glass of water.", login: "Log in", register: "Create account", leaderboard: "Family leaderboard",
  },
  hi: {
    today: "आज", medicines: "दवाइयाँ", chat: "सहायक", report: "रिपोर्ट", family: "परिवार", review: "समीक्षा",
    logout: "लॉग आउट", upcoming: "आने वाली", adherence: "नियमितता", missed: "छूटी", taken: "ली गई", points: "अंक",
    streak: "दिन लगातार", level: "स्तर", takeMedicine: "दवा लें", laterBtn: "बाद में", timeFor: "आपकी दवा का समय हो गया",
    nothingToday: "आज कोई खुराक नहीं। शुरू करने के लिए दवा जोड़ें।", diet: "अच्छा खाएँ", eat: "खाएँ", avoid: "न खाएँ",
    water: "पानी की याद", askHint: "अपने शेड्यूल के बारे में पूछें…", send: "भेजें", speak: "बोलें", badges: "बैज",
    checkTablet: "गोली जाँचें", tryAgain: "यह सही गोली नहीं लग रही। उसे पास लाकर फिर कोशिश करें।",
    confirmManual: "कैमरे के बिना पुष्टि करें", verified: "गोली मिल गई। खुराक दर्ज हो गई।",
    remindDrink: "एक गिलास पानी पीने का समय है।", login: "लॉग इन", register: "खाता बनाएँ", leaderboard: "परिवार की तालिका",
  },
  te: {
    today: "ఈ రోజు", medicines: "మందులు", chat: "సహాయకుడు", report: "నివేదిక", family: "కుటుంబం", review: "సమీక్ష",
    logout: "లాగ్ అవుట్", upcoming: "రాబోయేవి", adherence: "క్రమబద్ధత", missed: "తప్పినవి", taken: "వేసుకున్నవి", points: "పాయింట్లు",
    streak: "రోజుల వరుస", level: "స్థాయి", takeMedicine: "మందు వేసుకోండి", laterBtn: "తర్వాత", timeFor: "మీ మందు సమయం అయింది",
    nothingToday: "ఈ రోజు మోతాదులు లేవు. మొదలుపెట్టడానికి మందు జోడించండి.", diet: "మంచి ఆహారం", eat: "తినండి", avoid: "వద్దు",
    water: "నీటి రిమైండర్లు", askHint: "మీ షెడ్యూల్ గురించి అడగండి…", send: "పంపండి", speak: "మాట్లాడండి", badges: "బ్యాడ్జీలు",
    checkTablet: "మాత్ర తనిఖీ", tryAgain: "ఇది సరైన మాత్రలా లేదు. దగ్గరగా పట్టుకుని మళ్లీ ప్రయత్నించండి.",
    confirmManual: "కెమెరా లేకుండా నిర్ధారించండి", verified: "మాత్ర సరిపోయింది. మోతాదు నమోదైంది.",
    remindDrink: "ఒక గ్లాసు నీరు తాగే సమయం.", login: "లాగిన్", register: "ఖాతా సృష్టించండి", leaderboard: "కుటుంబ జాబితా",
  },
};
export const makeT = (lang) => (k, vars) => {
  let v = D[lang]?.[k] ?? X[lang]?.[k] ?? D.en[k] ?? X.en[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) v = v.replace(`{${a}}`, b);
  return v;
};

export function speak(text, lang) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH[lang] || "en-IN";
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

// Extra strings for the redesigned screens
const X = {
  en: { calendar: "Calendar", rewards: "Rewards", greetMorning: "Good morning", greetAfternoon: "Good afternoon", greetEvening: "Good evening", nextDose: "Next dose", dueNow: "Due now",
        inMin: "in {n} min", allDone: "All doses done for today", enableCamera: "Turn on camera & alerts",
        enableCameraDesc: "So your camera opens by itself at medicine time and checks the tablet.", cameraStarting: "Starting camera…", yourTablet: "Your tablet",
        holdTablet: "Hold the tablet in the frame, then tap Check tablet." },
  hi: { calendar: "कैलेंडर", rewards: "इनाम", greetMorning: "सुप्रभात", greetAfternoon: "नमस्कार", greetEvening: "शुभ संध्या", nextDose: "अगली खुराक", dueNow: "अभी लें",
        inMin: "{n} मिनट में", allDone: "आज की सभी खुराकें पूरी", enableCamera: "कैमरा और अलर्ट चालू करें",
        enableCameraDesc: "ताकि दवा के समय कैमरा अपने आप खुले और गोली जाँचे।", cameraStarting: "कैमरा चालू हो रहा है…", yourTablet: "आपकी गोली",
        holdTablet: "गोली को फ्रेम में रखें, फिर \"गोली जाँचें\" दबाएँ।" },
  te: { calendar: "క్యాలెండర్", rewards: "బహుమతులు", greetMorning: "శుభోదయం", greetAfternoon: "శుభ మధ్యాహ్నం", greetEvening: "శుభ సాయంత్రం", nextDose: "తదుపరి మోతాదు", dueNow: "ఇప్పుడే వేసుకోండి",
        inMin: "{n} నిమిషాల్లో", allDone: "ఈ రోజు మోతాదులన్నీ పూర్తి", enableCamera: "కెమెరా & అలర్ట్‌లు ఆన్ చేయండి",
        enableCameraDesc: "మందు సమయంలో కెమెరా దానంతట అదే తెరుచుకుని మాత్రను తనిఖీ చేస్తుంది.", cameraStarting: "కెమెరా ప్రారంభమవుతోంది…", yourTablet: "మీ మాత్ర",
        holdTablet: "మాత్రను ఫ్రేమ్‌లో పట్టుకుని, \"మాత్ర తనిఖీ\" నొక్కండి." },
};