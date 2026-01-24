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
    key: 'medicalHistory',
    label: 'Medical History',
    type: 'repeatable',
    fields: [
      {
        key: 'medicineName',
        label: 'Medicine Name',
        type: 'text',
        required: true,
        placeholder: 'Write medicine name'
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
  medicalHistory: []
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
