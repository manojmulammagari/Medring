// lib/phrasebook.ts: deterministic EN/HI/ES templates over compiled enums. Label free text is never translated.
import type { CompiledMedication, DoseEvent, DoseForm, MealRule, UmsSlot } from '@/types/ums';
import { doseGeometry, quantityPhrase } from '@/lib/ums-compiler';

export type Lang = 'en' | 'hi' | 'es';

export const LANGS: ReadonlyArray<{ id: Lang; label: string; speech: string }> = [
    { id: 'en', label: 'English', speech: 'en-US' },
    { id: 'hi', label: 'हिन्दी', speech: 'hi-IN' },
    { id: 'es', label: 'Español', speech: 'es-ES' },
];
export const langConfig = (lang: Lang) => LANGS.find((l) => l.id === lang) ?? { id: 'en' as Lang, label: 'English', speech: 'en-US' };

export interface UiStrings {
    rightNow: string;
    upNext: string;
    ifNeeded: string;
    hub: string;
    askPharmacist: string;
    nothingDue: string;
    halted: string;
    fridgeTitle: string;
    labelDirections: string;
    questions: string;
    disclaimer: string;
    takeDose: string;
    taken: string;
    timeOfDay: string;
    originalLine: string;
    readAloud: string;
    sourceSpanVerified: string;
}

const T: Record<Lang, UiStrings> = {
    en: {
        rightNow: 'Right now',
        upNext: 'Up next',
        ifNeeded: 'Only if needed',
        hub: 'As needed',
        askPharmacist: 'Ask your pharmacist',
        nothingDue: 'No scheduled doses in this view.',
        halted: 'ask your pharmacist. The label is unclear.',
        fridgeTitle: 'My medicine day',
        labelDirections: 'Label directions (as printed)',
        questions: 'Questions for my pharmacist',
        disclaimer:
            'This sheet restates the original label. It is not medical advice. If anything differs from your label, follow the label and ask your pharmacist.',
        takeDose: 'Take dose',
        taken: 'Taken ✓',
        timeOfDay: 'Time of day stated on the label',
        originalLine: 'Original line',
        readAloud: 'Read aloud',
        sourceSpanVerified: 'Source span verified',
    },
    hi: {
        rightNow: 'अभी',
        upNext: 'अगली खुराक',
        ifNeeded: 'केवल ज़रूरत पड़ने पर',
        hub: 'ज़रूरत पर',
        askPharmacist: 'अपने फार्मासिस्ट से पूछें',
        nothingDue: 'इस समय कोई निर्धारित खुराक नहीं।',
        halted: 'अपने फार्मासिस्ट से पूछें। लेबल स्पष्ट नहीं है।',
        fridgeTitle: 'मेरी दवाओं का दिन',
        labelDirections: 'लेबल के निर्देश (जैसे छपे हैं)',
        questions: 'फार्मासिस्ट के लिए सवाल',
        disclaimer:
            'यह शीट मूल लेबल को ही दोहराती है। यह चिकित्सकीय सलाह नहीं है। यदि कुछ भी आपके लेबल से अलग हो, तो लेबल का पालन करें और अपने फार्मासिस्ट से पूछें।',
        takeDose: 'लें',
        taken: 'लिया ✓',
        timeOfDay: 'लेबल पर दिन का समय बताया गया',
        originalLine: 'मूल पंक्ति',
        readAloud: 'ज़ोर से पढ़ें',
        sourceSpanVerified: 'स्रोत स्पैन सत्यापित',
    },
    es: {
        rightNow: 'Ahora',
        upNext: 'Siguiente',
        ifNeeded: 'Solo si es necesario',
        hub: 'Si es necesario',
        askPharmacist: 'Pregunte a su farmacéutico',
        nothingDue: 'No hay dosis programadas en esta vista.',
        halted: 'pregunte a su farmacéutico. La etiqueta no es clara.',
        fridgeTitle: 'Mi día de medicinas',
        labelDirections: 'Indicaciones de la etiqueta (tal como están impresas)',
        questions: 'Preguntas para mi farmacéutico',
        disclaimer:
            'Esta hoja repite la etiqueta original. No es consejo médico. Si algo difiere de su etiqueta, siga la etiqueta y pregunte a su farmacéutico.',
        takeDose: 'Tomar dosis',
        taken: 'Tomado ✓',
        timeOfDay: 'Hora del día indicada en la etiqueta',
        originalLine: 'Línea original',
        readAloud: 'Leer en voz alta',
        sourceSpanVerified: 'Origen del span verificado',
    },
};
export const ui = (lang: Lang): UiStrings => T[lang];

const SLOT_NAME: Record<Lang, Record<UmsSlot, string>> = {
    en: { MORNING: 'Morning', NOON: 'Noon', EVENING: 'Evening', BEDTIME: 'Bedtime' },
    hi: { MORNING: 'सुबह', NOON: 'दोपहर', EVENING: 'शाम', BEDTIME: 'सोते समय' },
    es: { MORNING: 'Mañana', NOON: 'Mediodía', EVENING: 'Tarde', BEDTIME: 'Al acostarse' },
};
const SLOT_PHRASE: Record<Lang, Record<UmsSlot, string>> = {
    en: { MORNING: 'in the morning', NOON: 'at noon', EVENING: 'in the evening', BEDTIME: 'at bedtime' },
    hi: { MORNING: 'सुबह', NOON: 'दोपहर में', EVENING: 'शाम को', BEDTIME: 'सोते समय' },
    es: { MORNING: 'por la mañana', NOON: 'al mediodía', EVENING: 'por la tarde', BEDTIME: 'al acostarse' },
};
const MEAL: Record<Lang, Record<MealRule, string>> = {
    en: { BEFORE_FOOD: 'before food (empty stomach)', WITH_FOOD: 'with food', AFTER_FOOD: 'after food', NONE_STATED: '' },
    hi: { BEFORE_FOOD: 'खाने से पहले (खाली पेट)', WITH_FOOD: 'खाने के साथ', AFTER_FOOD: 'खाने के बाद', NONE_STATED: '' },
    es: { BEFORE_FOOD: 'antes de comer (estómago vacío)', WITH_FOOD: 'con comida', AFTER_FOOD: 'después de comer', NONE_STATED: '' },
};
const NOUN: Record<'hi' | 'es', Record<Exclude<DoseForm, 'LIQUID_ML'>, readonly [string, string]>> = {
    hi: {
        TABLET: ['गोली', 'गोलियां'],
        CAPSULE: ['कैप्सूल', 'कैप्सूल'],
        DROP: ['बूंद', 'बूंदें'],
        PUFF: ['पफ', 'पफ'],
        SPRAY: ['स्प्रे', 'स्प्रे'],
        UNIT: ['खुराक', 'खुराक'],
    },
    es: {
        TABLET: ['tableta', 'tabletas'],
        CAPSULE: ['cápsula', 'cápsulas'],
        DROP: ['gota', 'gotas'],
        PUFF: ['inhalación', 'inhalaciones'],
        SPRAY: ['pulverización', 'pulverizaciones'],
        UNIT: ['dosis', 'dosis'],
    },
};
const GLYPH = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' } as const;

export const slotName = (slot: UmsSlot, lang: Lang): string => SLOT_NAME[lang][slot];
export const mealPhrase = (rule: MealRule, lang: Lang): string => MEAL[lang][rule];

export function quantityText(quantity: number, form: DoseForm, lang: Lang): string {
    if (lang === 'en') return quantityPhrase(quantity, form);
    const g = doseGeometry(quantity, form);
    if (g.kind === 'VOLUME') return g.label;
    const num = g.whole === 0 ? GLYPH[g.partial] : g.partial === 0 ? String(g.whole) : `${g.whole}${GLYPH[g.partial]}`;
    const [one, many] = NOUN[lang][form as Exclude<DoseForm, 'LIQUID_ML'>];
    if (form === 'TABLET' && g.whole === 0) {
        if (lang === 'hi') return g.partial === 0.5 ? 'आधी गोली' : g.partial === 0.25 ? 'चौथाई गोली' : `${num} ${one}`;
        return g.partial === 0.5 ? 'media tableta' : g.partial === 0.25 ? 'un cuarto de tableta' : `${num} ${one}`;
    }
    return `${num} ${quantity > 1 ? many : one}`;
}

const joinList = (parts: readonly string[], conj: string): string =>
    parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')}${conj}${parts[parts.length - 1]}`;

/** Full sentence for one medication. English delegates to the compiler so both can never diverge. */
export function describeMedication(med: CompiledMedication, lang: Lang): string {
    if (lang === 'en') return med.plainLanguage;
    const name = [med.drugName, med.strength].filter(Boolean).join(' ');
    if (med.status === 'HALTED') return `${name}: ${T[lang].halted}`;
    const form = med.form ?? 'UNIT';
    if (med.status === 'PRN' && med.prn) {
        const qty = quantityText(med.prn.quantity, form, lang);
        return lang === 'hi'
            ? `${name}: ज़रूरत पड़ने पर ही ${qty} लें (लेबल: "${med.prn.indication}")।`
            : `${name}: tome ${qty} solo si lo necesita (etiqueta: "${med.prn.indication}").`;
    }
    const meal = MEAL[lang][med.doses[0]?.mealRule ?? 'NONE_STATED'];
    if (lang === 'hi') {
        const clauses = med.doses.map((d) => `${SLOT_PHRASE.hi[d.slot]} ${quantityText(d.quantity, form, 'hi')}`);
        return `${name}: ${joinList(clauses, ' और ')} लें${meal ? `, ${meal}` : ''}।`;
    }
    const clauses = med.doses.map((d) => `${quantityText(d.quantity, form, 'es')} ${SLOT_PHRASE.es[d.slot]}`);
    return `${name}: tome ${joinList(clauses, ' y ')}${meal ? `, ${meal}` : ''}.`;
}

/** "1 tablet, before food (empty stomach)": one dose, no drug name. */
export function describeDose(med: CompiledMedication, dose: DoseEvent, lang: Lang): string {
    return [quantityText(dose.quantity, med.form ?? 'UNIT', lang), MEAL[lang][dose.mealRule]].filter(Boolean).join(', ');
}