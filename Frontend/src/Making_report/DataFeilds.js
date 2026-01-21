export const patientBasicDetailsFields = [
  {
    key: 'name',
    label: 'Name',
    type: 'text',
    required: true,
    placeholder: 'Enter patient name'
  },
  {
    key: 'sex',
    label: 'Sex',
    type: 'select',
    required: true,
    options: [
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' },
      { label: 'Other', value: 'other' }
    ]
  },
  {
    key: 'date',
    label: 'Date',
    type: 'date',
    required: true
  }
]

const patientBasicDetailsInitialValues = {
  name: '',
  sex: '',
  date: ''
}

export const pastMedicalHistoryFields = [
  {
    key: 'illness',
    label: 'Illness',
    type: 'repeatable',
    fields: [
      {
        key: 'question',
        label: 'Question',
        type: 'text',
        required: true,
        placeholder: 'Write question'
      },
      {
        key: 'answerType',
        label: 'Answer Type',
        type: 'select',
        required: true,
        options: [
          { label: 'Yes/No', value: 'yes_no' },
          { label: 'Text', value: 'text' },
          { label: 'Number', value: 'number' },
          { label: 'Date', value: 'date' },
          { label: 'Rating', value: 'rating' }
        ]
      },
      {
        key: 'answer',
        label: 'Answer',
        type: 'text',
        required: false,
        placeholder: 'Write answer'
      }
    ]
  }
]

export const pastMedicalHistoryInitialValues = {
  illness: []
}

export const surgicalHistoryFields = [
  {
    key: 'surgeries',
    label: 'Surgical History',
    type: 'repeatable',
    fields: [
      {
        key: 'surgeryName',
        label: 'Surgery Name',
        type: 'text',
        required: true,
        placeholder: 'Enter surgery name'
      },
      {
        key: 'surgeryMonth',
        label: 'Surgery Month',
        type: 'select',
        required: false,
        options: [
          { label: 'January', value: '01' },
          { label: 'February', value: '02' },
          { label: 'March', value: '03' },
          { label: 'April', value: '04' },
          { label: 'May', value: '05' },
          { label: 'June', value: '06' },
          { label: 'July', value: '07' },
          { label: 'August', value: '08' },
          { label: 'September', value: '09' },
          { label: 'October', value: '10' },
          { label: 'November', value: '11' },
          { label: 'December', value: '12' }
        ]
      },
      {
        key: 'surgeryYear',
        label: 'Surgery Year',
        type: 'number',
        required: true,
        placeholder: 'YYYY'
      }
    ]
  }
]

export const surgicalHistoryInitialValues = {
  surgeries: []
}

export const familyHistoryFields = [
  {
    key: 'familyMembers',
    label: 'Family History',
    type: 'repeatable',
    fields: [
      {
        key: 'relation',
        label: 'Relation',
        type: 'text',
        required: true,
        placeholder: 'e.g. Father, Mother'
      },
      {
        key: 'memberName',
        label: 'Member Name',
        type: 'text',
        required: true,
        placeholder: 'Enter name'
      },
      {
        key: 'illness',
        label: 'Illness',
        type: 'text',
        required: true,
        placeholder: 'Enter illness'
      }
    ]
  }
]

export const familyHistoryInitialValues = {
  familyMembers: []
}

const illness = [
  'Diabetes Mellitus',
  'Hypertension',
  'Coronary Artery Disease',
  'Heart Failure',
  'Previous Heart Attack',
  'Arrhythmia',
  'Rheumatic Heart Disease',
  'Stroke',
  'Transient Ischemic Attack',
  'Epilepsy / Seizures',
  'Asthma',
  'COPD',
  'Pulmonary Tuberculosis',
  'Sleep Apnea',
  'Chronic Kidney Disease',
  'On Dialysis',
  'Kidney Stones',
  'Recurrent UTI',
  'Chronic Liver Disease',
  'Fatty Liver',
  'Hepatitis B',
  'Hepatitis C',
  'Cirrhosis',
  'Peptic Ulcer Disease',
  'GERD / Acid Reflux',
  'Pancreatitis',
  'Gallstones',
  'Inflammatory Bowel Disease',
  'Chronic Constipation',
  'Anemia',
  'Thalassemia',
  'Sickle Cell Disease',
  'Bleeding Disorder',
  'Blood Transfusion History',
  'Hypothyroidism',
  'Hyperthyroidism',
  'Goiter',
  'Osteoarthritis',
  'Rheumatoid Arthritis',
  'Osteoporosis',
  'Gout',
  'Chronic Back Pain',
  'Migraine',
  'Parkinson’s Disease',
  'Alzheimer’s Disease',
  'Multiple Sclerosis',
  'Peripheral Neuropathy',
  'Depression',
  'Anxiety Disorder',
  'Bipolar Disorder',
  'Schizophrenia',
  'Dementia',
  'Cancer (Any)',
  'Breast Cancer',
  'Lung Cancer',
  'Colorectal Cancer',
  'Blood Cancer',
  'Chemotherapy History',
  'Radiotherapy History',
  'Immunosuppression',
  'Autoimmune Disease',
  'HIV / AIDS',
  'COVID-19 Infection (Past)',
  'Dengue',
  'Malaria',
  'Typhoid',
  'Smoking',
  'Alcohol Consumption',
  'Substance Abuse',
  'Obesity',
  'Underweight',
  'PCOS',
  'Endometriosis',
  'Infertility',
  'High-Risk Pregnancy',
  'Previous C-Section',
  'Prostate Enlargement',
  'Erectile Dysfunction',
  'Cataract',
  'Glaucoma',
  'Hearing Loss',
  'Chronic Sinusitis',
  'Skin Allergy',
  'Psoriasis',
  'Eczema',
  'Drug Allergy',
  'Food Allergy',
  'Previous Surgery',
  'Organ Transplant',
  'Pacemaker',
  'Stent Placement',
  'Hernia',
  'Varicose Veins',
  'Deep Vein Thrombosis',
  'Pulmonary Embolism',
  'Chronic Pain Syndrome',
  'Fibromyalgia',
  'Vision Impairment',
  'Physical Disability',
  'Any Other Chronic Illness'
]

const surgaries = [
  'Appendectomy',
  'Cholecystectomy',
  'Hernia Repair',
  'Caesarean Section (C-Section)',
  'Normal Delivery with Episiotomy',
  'Hysterectomy',
  'Oophorectomy',
  'Tubectomy / Female Sterilization',
  'Prostate Surgery',
  'TURP (Prostate)',
  'Circumcision',
  'Coronary Angioplasty',
  'Coronary Artery Bypass Surgery (CABG)',
  'Pacemaker Implantation',
  'Heart Valve Replacement',
  'Cardiac Catheterization',
  'Brain Surgery',
  'Spine Surgery',
  'Disc Surgery (Slip Disc)',
  'Craniotomy',
  'Knee Replacement',
  'Hip Replacement',
  'Shoulder Surgery',
  'Arthroscopy',
  'Fracture Fixation (ORIF)',
  'Amputation (Any)',
  'Cataract Surgery',
  'Glaucoma Surgery',
  'LASIK / Refractive Surgery',
  'Retinal Surgery',
  'Tonsillectomy',
  'Adenoidectomy',
  'Sinus Surgery',
  'Thyroidectomy',
  'Parathyroid Surgery',
  'Mastectomy',
  'Breast Lump Excision',
  'Breast Reconstruction',
  'Cancer Tumor Removal',
  'Chemotherapy Port Placement',
  'Radiotherapy Procedure',
  'Dialysis Access Surgery (AV Fistula)',
  'Kidney Transplant',
  'Liver Transplant',
  'Lung Surgery',
  'Bowel Surgery',
  'Colostomy',
  'Ileostomy',
  'Hemorrhoid Surgery',
  'Fistula Surgery',
  'Piles Surgery',
  'Fissure Surgery',
  'Bariatric Surgery',
  'Gastric Bypass',
  'Gastric Sleeve',
  'Pancreatic Surgery',
  'Splenectomy',
  'Varicose Vein Surgery',
  'Deep Vein Thrombosis Procedure',
  'Skin Grafting',
  'Plastic / Cosmetic Surgery',
  'Burn Reconstruction Surgery',
  'Cleft Lip Surgery',
  'Cleft Palate Surgery',
  'ENT Endoscopic Surgery',
  'Ear Surgery',
  'Cochlear Implant',
  'Dental Surgery',
  'Jaw / Maxillofacial Surgery',
  'Ureteric Stent Placement',
  'Bladder Surgery',
  'Kidney Stone Surgery',
  'Urethral Surgery',
  'Testicular Surgery',
  'Varicocele Surgery',
  'Gynecological Laparoscopy',
  'Diagnostic Laparoscopy',
  'IVF / Fertility Procedure',
  'Endometriosis Surgery',
  'PCOS Surgery',
  'Eye Muscle Surgery',
  'Hand Surgery',
  'Wrist Surgery',
  'Ankle Surgery',
  'Foot Surgery',
  'Sports Injury Surgery',
  'Trauma Surgery',
  'Emergency Exploratory Surgery',
  'Organ Biopsy Procedure',
  'Endoscopic Procedure',
  'Colonoscopy (Therapeutic)',
  'Bronchoscopy (Interventional)',
  'Cardiac Stent Placement',
  'ICD Implantation',
  'Neuro-Stimulator Implant',
  'Pain Management Procedure',
  'Minor Day-Care Surgery',
  'Cosmetic Injection Procedure',
  'Other Major Surgery',
  'Other Minor Surgery'
]


export default {
  patientBasicDetailsFields,
  pastMedicalHistoryFields,
  surgicalHistoryFields,
  familyHistoryFields,
  patientBasicDetailsInitialValues,
  pastMedicalHistoryInitialValues,
  surgicalHistoryInitialValues,
  familyHistoryInitialValues
}
