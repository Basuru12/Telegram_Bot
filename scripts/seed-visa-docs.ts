import {
  createVisaDocument,
  initDb,
  listVisaDocuments,
} from "../src/db.js";

const titles = [
  "Copy of Passport",
  "Full offer Letter",
  "Visa photos (get on pen from Samarakoon studio, Nugegoda preferably)",
  "Birth certificate of applicant",
  "Applicants Identity Card",
  "Parents Birth certificate",
  "Marriage Applicant's marriage Certificate (if in Sinhala, translation should be done)",
  "Identity cards, bank statements and confirmation of balances from bank on letter head",
  "Father's Identity Card / Translation",
  "Flight details (if required; agent fee Rs 5,000)",
  "Assets available (vehicle, house deeds and other properties)",
  "Form 1200",
  "Family declaration Form and copies of passports of family if available",
  "Past employment details and certificates",
  "Pension/salary details of self or sponsor / Bonus and other perks",
  "Students / Sponsor's Visa and passport copy",
  "Copy of joint bank statement if joint account is available",
  "IELTS Results",
  "Financial Undertaking Depending on Finances",
  "Medical Report No.",
  "Police Report",
  "Transcript from Campus",
];

initDb();

const existing = new Set(listVisaDocuments().map((d) => d.title));
let added = 0;
for (const title of titles) {
  if (existing.has(title)) continue;
  createVisaDocument({ title, dueDate: null });
  added++;
}

console.log(`Added ${added} documents (${listVisaDocuments().length} total).`);
