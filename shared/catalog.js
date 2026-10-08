// Reference data: specialties, lab test catalogue, drug list, wards and billable services.
export const SPECIALTIES = [
  'Cardiology', 'Dermatology', 'Endocrinology', 'Gastroenterology', 'Neurology', 'Oncology', 'Pediatrics',
  'Psychiatry', 'Pulmonology', 'Nephrology', 'Orthopedics', 'Ophthalmology', 'Otolaryngology (ENT)',
  'Gynecology/Obstetrics', 'Rheumatology', 'Urology', 'Hematology', 'Allergy & Immunology', 'General Surgery',
  'Family Medicine',
];

// code, name, category, unit, [low, high], [critLow, critHigh], price
export const LAB_TESTS = [
  ['HGB', 'Hemoglobin', 'Hematology', 'g/dL', [12, 17.5], [7, 20], 8],
  ['WBC', 'White blood cell count', 'Hematology', '10^3/uL', [4, 11], [2, 30], 8],
  ['PLT', 'Platelet count', 'Hematology', '10^3/uL', [150, 400], [50, 1000], 8],
  ['GLU-F', 'Fasting glucose', 'Chemistry', 'mg/dL', [70, 99], [40, 400], 6],
  ['HBA1C', 'HbA1c', 'Chemistry', '%', [4, 5.6], [null, 12], 18],
  ['CREA', 'Creatinine', 'Chemistry', 'mg/dL', [0.6, 1.3], [null, 8], 7],
  ['UREA', 'Blood urea', 'Chemistry', 'mg/dL', [15, 45], [null, 150], 7],
  ['NA', 'Sodium', 'Electrolytes', 'mmol/L', [135, 145], [120, 160], 9],
  ['K', 'Potassium', 'Electrolytes', 'mmol/L', [3.5, 5.1], [2.5, 6.5], 9],
  ['ALT', 'ALT (SGPT)', 'Liver', 'U/L', [7, 56], [null, 1000], 9],
  ['AST', 'AST (SGOT)', 'Liver', 'U/L', [10, 40], [null, 1000], 9],
  ['CHOL', 'Total cholesterol', 'Lipids', 'mg/dL', [0, 200], [null, null], 10],
  ['LDL', 'LDL cholesterol', 'Lipids', 'mg/dL', [0, 100], [null, null], 12],
  ['HDL', 'HDL cholesterol', 'Lipids', 'mg/dL', [40, 100], [null, null], 12],
  ['TG', 'Triglycerides', 'Lipids', 'mg/dL', [0, 150], [null, 1000], 12],
  ['TSH', 'TSH', 'Endocrine', 'mIU/L', [0.4, 4], [0.01, 50], 16],
  ['CRP', 'C-reactive protein', 'Inflammation', 'mg/L', [0, 5], [null, null], 11],
  ['VITD', 'Vitamin D (25-OH)', 'Vitamins', 'ng/mL', [30, 100], [10, null], 24],
  ['INR', 'INR', 'Coagulation', 'ratio', [0.8, 1.2], [null, 5], 10],
  ['URIC', 'Uric acid', 'Chemistry', 'mg/dL', [3.5, 7.2], [null, 13], 8],
].map(([code, name, category, unit, [low, high], [critLow, critHigh], price]) => ({
  code, name, category, unit, low, high, critLow, critHigh, price,
}));

// name, generic, category, unit, price, reorder level
export const DRUGS = [
  ['Paracetamol 500 mg', 'Paracetamol', 'Analgesic', 'tablet', 0.1, 200],
  ['Ibuprofen 400 mg', 'Ibuprofen', 'Analgesic', 'tablet', 0.15, 150],
  ['Amoxicillin 500 mg', 'Amoxicillin', 'Antibiotic', 'capsule', 0.35, 150],
  ['Azithromycin 500 mg', 'Azithromycin', 'Antibiotic', 'tablet', 1.2, 60],
  ['Ciprofloxacin 500 mg', 'Ciprofloxacin', 'Antibiotic', 'tablet', 0.5, 80],
  ['Metformin 500 mg', 'Metformin', 'Antidiabetic', 'tablet', 0.08, 300],
  ['Glimepiride 2 mg', 'Glimepiride', 'Antidiabetic', 'tablet', 0.2, 100],
  ['Amlodipine 5 mg', 'Amlodipine', 'Antihypertensive', 'tablet', 0.09, 250],
  ['Losartan 50 mg', 'Losartan', 'Antihypertensive', 'tablet', 0.18, 200],
  ['Atorvastatin 20 mg', 'Atorvastatin', 'Lipid lowering', 'tablet', 0.22, 200],
  ['Omeprazole 20 mg', 'Omeprazole', 'Gastro', 'capsule', 0.12, 200],
  ['Cetirizine 10 mg', 'Cetirizine', 'Antiallergic', 'tablet', 0.06, 150],
  ['Salbutamol inhaler 100 mcg', 'Salbutamol', 'Respiratory', 'inhaler', 4.5, 25],
  ['Levothyroxine 50 mcg', 'Levothyroxine', 'Endocrine', 'tablet', 0.07, 150],
  ['Aspirin 75 mg', 'Aspirin', 'Antiplatelet', 'tablet', 0.04, 250],
  ['ORS sachet', 'Oral rehydration salts', 'Gastro', 'sachet', 0.4, 100],
  ['Diclofenac gel 30 g', 'Diclofenac', 'Topical', 'tube', 3.2, 30],
  ['Vitamin D3 60000 IU', 'Cholecalciferol', 'Vitamins', 'capsule', 0.9, 60],
].map(([name, genericName, category, unit, price, reorderLevel]) => ({ name, genericName, category, unit, price, reorderLevel }));

export const WARDS = [
  { name: 'General Ward A', type: 'general', floor: 1, beds: 10, dailyRate: 40 },
  { name: 'General Ward B', type: 'general', floor: 1, beds: 10, dailyRate: 40 },
  { name: 'Intensive Care', type: 'icu', floor: 2, beds: 6, dailyRate: 220 },
  { name: 'Maternity', type: 'maternity', floor: 2, beds: 8, dailyRate: 80 },
  { name: 'Pediatrics', type: 'pediatric', floor: 3, beds: 8, dailyRate: 60 },
  { name: 'Private Rooms', type: 'private', floor: 3, beds: 6, dailyRate: 120 },
];
export const WARD_TYPES = ['general', 'icu', 'maternity', 'pediatric', 'private'];

export const SERVICES = [
  ['Dressing and wound care', 12],
  ['ECG', 18],
  ['Chest X-ray', 28],
  ['Ultrasound abdomen', 45],
  ['Nebulisation', 10],
  ['Minor suturing', 35],
  ['Injection administration', 5],
  ['Physiotherapy session', 25],
].map(([name, price]) => ({ name, price }));

// code, name, typical drugs (index into DRUGS), typical tests (codes), chief complaint
export const DIAGNOSES = [
  { code: 'I10', name: 'Essential hypertension', drugs: [7, 8], tests: ['CREA', 'K', 'CHOL'], complaint: 'Headache and dizziness' },
  { code: 'E11', name: 'Type 2 diabetes mellitus', drugs: [5, 6], tests: ['GLU-F', 'HBA1C', 'CREA'], complaint: 'Increased thirst and fatigue' },
  { code: 'J06', name: 'Acute upper respiratory infection', drugs: [0, 11], tests: ['WBC', 'CRP'], complaint: 'Sore throat and cough' },
  { code: 'J45', name: 'Asthma', drugs: [12, 11], tests: ['WBC'], complaint: 'Wheezing and breathlessness' },
  { code: 'K29', name: 'Gastritis', drugs: [10, 0], tests: ['HGB'], complaint: 'Burning upper abdominal pain' },
  { code: 'A09', name: 'Gastroenteritis', drugs: [15, 4], tests: ['WBC', 'NA', 'K'], complaint: 'Loose motions and vomiting' },
  { code: 'M54', name: 'Low back pain', drugs: [1, 16], tests: ['VITD'], complaint: 'Lower back pain' },
  { code: 'E03', name: 'Hypothyroidism', drugs: [13], tests: ['TSH'], complaint: 'Tiredness and weight gain' },
  { code: 'E78', name: 'Hyperlipidemia', drugs: [9, 14], tests: ['CHOL', 'LDL', 'HDL', 'TG'], complaint: 'Routine check-up, high cholesterol' },
  { code: 'N39', name: 'Urinary tract infection', drugs: [4, 0], tests: ['WBC', 'CREA'], complaint: 'Burning urination' },
  { code: 'B34', name: 'Viral fever', drugs: [0, 15], tests: ['WBC', 'PLT', 'CRP'], complaint: 'Fever and body ache' },
  { code: 'D50', name: 'Iron deficiency anemia', drugs: [17], tests: ['HGB', 'WBC'], complaint: 'Weakness and pallor' },
  { code: 'G43', name: 'Migraine', drugs: [0, 1], tests: [], complaint: 'Recurring one-sided headache' },
  { code: 'L20', name: 'Atopic dermatitis', drugs: [11], tests: [], complaint: 'Itchy skin rash' },
  { code: 'M10', name: 'Gout', drugs: [1], tests: ['URIC', 'CREA'], complaint: 'Painful swollen big toe' },
];
