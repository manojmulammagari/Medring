// Run: npx tsx scripts/smoke-fixtures.ts
import { CLINICAL_FIXTURES } from '@/data/clinical-fixtures';
import { compileDocument } from '@/lib/ums-compiler';

let failed = false;
for (const fx of CLINICAL_FIXTURES) {
    const r = compileDocument(fx.document);
    if (r.status !== 'OK') {
        console.error('FAIL', fx.id, r.reason);
        failed = true;
        continue;
    }
    const m = r.schedule.medications;
    const got = {
        scheduledMeds: m.filter((x) => x.status === 'SCHEDULED').length,
        doseEvents: m.reduce((n, x) => n + x.doses.length, 0),
        prnMeds: m.filter((x) => x.status === 'PRN').length,
        haltedMeds: m.filter((x) => x.status === 'HALTED').length,
    };
    const ok = JSON.stringify(got) === JSON.stringify(fx.expected);
    if (!ok) failed = true;
    console.log(ok ? 'PASS' : 'FAIL', fx.id, got);
    console.log('  telemetry', r.schedule.telemetry);
    for (const med of m) {
        console.log(`  [${med.status}] ${med.plainLanguage}`, med.halts.map((h) => h.code));
    }
}
process.exit(failed ? 1 : 0);