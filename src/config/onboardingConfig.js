/* ---------- ONBOARDING STEPS ---------- */

export const STEPS = [
    {
        id: 'termDates',
        heading: 'Have we got your term dates right?',
        subtitle: "These currently default to the University of Bristol term dates, but you can edit them if the dates are different for your uni"
    },
    {
        id: 'balance',
        heading: "What's your current bank balance?",
        subtitle: "Add up all your accounts — a rough estimate is fine!"
    },
    {
        id: 'overdraft',
        heading: "What's your overdraft limit?",
        subtitle: 'This helps us show when you might dip into it.'
    },
    {
        id: 'regularIncome',
        heading: 'Where do you regularly receive money from?',
        subtitle: "Enter any income that you're almost certain you're going to receive."
    },
    {
        id: 'maintenanceLoan',
        heading: 'How much is your maintenance loan?',
        subtitle: "Enter the loan you're given for rent and living costs."
    },
    {
        id: 'bursary',
        heading: 'Do you receive any bursaries?',
        subtitle: 'Include university bursaries or grants.'
    },
    {
        id: 'familyFriends',
        heading: 'How much do you receive from family and friends?',
        subtitle: 'Include any regular financial support from family or friends.'
    },
    {
        id: 'work',
        heading: 'How much do you earn from work?',
        subtitle: 'Include part-time jobs, freelancing, or any paid work.'
    },
    {
        id: 'otherIncome',
        heading: 'What other income do you receive?',
        subtitle: 'Include any other regular income not listed above.'
    },
    {
        id: 'rent',
        heading: 'How much is your accommodation rent?',
        subtitle: 'Include your total rent amount — we\'ll work out the rest.'
    },
    {
        id: 'regularExpenses',
        heading: 'What regular expenses do you have?',
        subtitle: 'Select any expenses you pay regularly.'
    },
    {
        id: 'bills',
        heading: 'How much do you spend on bills?',
        subtitle: 'Include phone, internet, energy, water, and any other regular bills.'
    },
    {
        id: 'uniFees',
        heading: 'How much are your university fees?',
        subtitle: 'Most UK students pay £9,250 per year.'
    },
    {
        id: 'savingsInvestments',
        heading: 'How much do you save or invest?',
        subtitle: 'Include any regular contributions to savings or investments.'
    },
    {
        id: 'otherExpense',
        heading: 'What other expenses do you have?',
        subtitle: 'Include any other regular expenses not listed above.'
    },
    {
        id: 'weeklySpend',
        heading: 'How much do you typically spend each week?',
        subtitle: "Food, transport, going out — just a rough weekly average."
    },
    {
        id: 'summary',
        heading: 'Your Budget',
        subtitle: "Here's a summary of your finances for the year."
    }
]

/* ---------- OPTIONS ---------- */

export const UK_UNIVERSITIES = [
    'University of Bristol',
    'University of Oxford',
    'University of Cambridge',
    'Imperial College London',
    'University College London (UCL)',
    'London School of Economics (LSE)',
    'University of Edinburgh',
    'University of Manchester',
    'King\'s College London',
    'University of Warwick',
    'Durham University',
    'University of Glasgow',
    'University of Birmingham',
    'University of Southampton',
    'University of Leeds',
    'University of Sheffield',
    'University of Nottingham',
    'University of St Andrews',
    'Queen Mary University of London',
    'Lancaster University',
    'University of York',
    'University of Bath',
    'University of Exeter',
    'Cardiff University',
    'University of Sussex',
    'University of Liverpool',
    'University of Reading',
    'University of Aberdeen',
    'Newcastle University',
    'Queen\'s University Belfast',
    'University of Leicester',
    'Loughborough University',
    'University of Surrey',
    'University of Strathclyde',
    'Royal Holloway, University of London',
    'Swansea University',
    'Heriot-Watt University',
    'University of Dundee',
    'City, University of London',
    'Brunel University London',
    'Aston University',
    'University of East Anglia (UEA)',
    'SOAS University of London',
    'University of Kent',
    'University of Essex',
    'Northumbria University',
    'Nottingham Trent University',
    'Bournemouth University',
    'Coventry University',
    'University of Portsmouth',
    'University of Plymouth',
    'Liverpool John Moores University',
    'University of the West of England (UWE)',
    'De Montfort University',
    'University of Huddersfield',
    'Manchester Metropolitan University',
    'Sheffield Hallam University',
    'Birmingham City University',
    'University of Central Lancashire',
    'Oxford Brookes University',
    'Kingston University',
    'University of Lincoln',
    'Keele University',
    'Robert Gordon University',
    'Bangor University',
    'Aberystwyth University',
    'University of Stirling',
    'Edge Hill University',
    'Glasgow Caledonian University',
    'University of Bradford',
    'University of Hull',
    'University of Salford',
    'Goldsmiths, University of London',
    'University of Winchester',
    'Middlesex University',
    'University of Greenwich',
    'Staffordshire University',
    'University of Hertfordshire',
    'University of Westminster',
    'University of Roehampton',
    'Edinburgh Napier University',
    'Cardiff Metropolitan University',
    'University of Bedfordshire',
    'University of Chester',
    'University of Derby',
    'Anglia Ruskin University',
    'University of Brighton',
    'University of Wolverhampton',
    'University of Gloucestershire',
    'University of Northampton',
    'University of Sunderland',
    'Teesside University',
    'University of Bolton',
    'Canterbury Christ Church University',
    'University of South Wales',
    'Leeds Beckett University',
    'University of the West of Scotland',
    'London Metropolitan University',
    'University of East London',
    'Solent University',
    'York St John University',
    'University of Suffolk',
    'Wrexham University',
    'Buckinghamshire New University',
    'Liverpool Hope University',
    'University of Cumbria',
    'Bishop Grosseteste University',
    'University of Wales Trinity Saint David',
    'St Mary\'s University, Twickenham',
    'Newman University',
    'University of Chichester',
    'Falmouth University',
    'Plymouth Marjon University',
    'Leeds Arts University',
    'Ravensbourne University London',
    'University of the Arts London',
    'Arts University Bournemouth',
    'Royal College of Art',
    'Royal College of Music',
    'Royal Academy of Music',
    'Guildhall School of Music and Drama',
    'Royal Conservatoire of Scotland',
    'Courtauld Institute of Art'
].sort()

export const MONTH_LABELS = {
    september: 'September',
    october: 'October',
    november: 'November',
    december: 'December',
    january: 'January',
    february: 'February',
    march: 'March',
    april: 'April',
    may: 'May',
    june: 'June',
    july: 'July',
    august: 'August'
}

export const ALL_MONTH_KEYS = Object.keys(MONTH_LABELS)
export const DEFAULT_LOAN_MONTHS = ['september', 'january', 'april']

export const OTHER_INCOME_TYPE_OPTIONS = [
    { value: 'part_time_job', label: 'Part-time job' },
    { value: 'family', label: 'Family support' },
    { value: 'freelance', label: 'Freelance work' },
    { value: 'investments', label: 'Investments' },
    { value: 'other', label: 'Other' }
]

export const OTHER_INCOME_FREQ_OPTIONS = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'termly', label: 'Per Term' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'other', label: 'Other' }
]

export const REGULAR_FREQ_OPTIONS = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'other', label: 'Other' }
]

export const PAYMENT_TYPE_OPTIONS = [
    { value: 'rent', label: 'Rent' },
    { value: 'bills', label: 'Bills' },
    { value: 'subscription', label: 'Subscription' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'other', label: 'Other' }
]

export const DEFAULT_BURSARY_DATES = ['2025-10-27', '2026-02-09', '2026-03-30']

export const INITIAL_TERM_DATES = {
    terms: [
        {
            id: 'term1',
            name: 'Term 1',
            start: '2025-09-22',
            end: '2025-12-12',
            breaks: [{ id: 'b1', start: '2025-10-27', end: '2025-10-31' }]
        },
        {
            id: 'term2',
            name: 'Term 2',
            start: '2026-01-19',
            end: '2026-05-01',
            breaks: [{ id: 'b2', start: '2026-02-23', end: '2026-02-27' }]
        }
    ]
}

export const BRISTOL_TERM_DATES = {
    terms: [
        {
            id: 'term1',
            name: 'Term 1',
            start: '2025-09-15',
            end: '2025-12-19',
            breaks: [
                { id: 'b1_welcome', name: 'Welcome Week', start: '2025-09-15', end: '2025-09-21' },
                { id: 'b1_reading', name: 'Reading Week', start: '2025-10-27', end: '2025-11-02' },
                { id: 'b1_examprep', name: 'Exam Prep Week', start: '2025-12-08', end: '2025-12-14' },
                { id: 'b1_exams', name: 'Exams', start: '2025-12-15', end: '2025-12-19' },
            ]
        },
        {
            id: 'term2',
            name: 'Term 2',
            start: '2026-01-12',
            end: '2026-03-22',
            breaks: [
                { id: 'b2_prep', name: 'Prep Week', start: '2026-01-12', end: '2026-01-18' },
                { id: 'b2_reading', name: 'Reading Week', start: '2026-02-23', end: '2026-03-01' },
            ]
        },
        {
            id: 'term3',
            name: 'Term 3',
            start: '2026-04-13',
            end: '2026-05-22',
            breaks: [
                { id: 'b3_examprep', name: 'Exam Prep Week', start: '2026-04-27', end: '2026-05-04' },
                { id: 'b3_exams', name: 'Exams', start: '2026-05-05', end: '2026-05-22' },
            ]
        }
    ]
}

const UNIVERSITY_TERM_DATES = {
    'University of Bristol': BRISTOL_TERM_DATES,
}

export function getTermDatesForUniversity(university) {
    return UNIVERSITY_TERM_DATES[university] || INITIAL_TERM_DATES
}

export function hasCustomTermDates(university) {
    return university in UNIVERSITY_TERM_DATES
}

export const INITIAL_FORM_DATA = {
    university: 'University of Bristol',
    termDates: { ...BRISTOL_TERM_DATES },
    balance: '',
    overdraft: '',
    incomeSources: [],
    expenseSources: [],
    savings: '',

    studentLoan: null,
    loanAmount: '',
    loanMonths: [...DEFAULT_LOAN_MONTHS],
    loanKnowDates: false,
    loanDates: {},
    instalmentDates: [],
    instalmentAmounts: {},

    rentAmount: '',
    rentAmountPeriod: 'monthly',
    rentFrequency: 'monthly',
    rentNextDate: '',
    rentTermDates: {},
    rentQuarterlyDates: {},
    rentVariesByTerm: false,
    rentNonTermAmount: '',
    rentStartDate: '',
    rentEndDate: '',

    billsAmount: '',
    billsAmountPeriod: 'monthly',
    billsFrequency: 'monthly',
    billsQuarterlyDates: {},
    billsVariesByTerm: false,
    billsNonTermAmount: '',
    billsStartDate: '',
    billsEndDate: '',

    uniFeesAmount: '9250',
    uniFeesAmountPeriod: 'yearly',
    uniFeesFrequency: 'yearly',
    uniFeesNextDate: '2025-10-27',
    uniFeesTermDates: {},
    uniFeesQuarterlyDates: {},
    uniFeesVariesByTerm: false,
    uniFeesNonTermAmount: '',

    familyNextDate: '',
    familyAmountPeriod: 'monthly',
    familyTermDates: {},
    familyQuarterlyDates: {},

    otherIncomeNextDate: '',
    otherIncomeAmountPeriod: 'monthly',
    otherIncomeTermDates: {},
    otherIncomeQuarterlyDates: {},

    otherIncomes: [],
    otherExpenses: [],

    savingsInvAmount: '',
    savingsInvAmountPeriod: 'monthly',
    savingsInvFrequency: 'monthly',
    savingsInvNextDate: '',
    savingsInvTermDates: {},
    savingsInvQuarterlyDates: {},
    savingsInvVariesByTerm: false,
    savingsInvNonTermAmount: '',

    otherExpenseAmount: '',
    otherExpenseAmountPeriod: 'monthly',
    otherExpenseFrequency: 'monthly',
    otherExpenseLabel: '',
    otherExpenseNextDate: '',
    otherExpenseTermDates: {},
    otherExpenseQuarterlyDates: {},
    otherExpenseVariesByTerm: false,
    otherExpenseNonTermAmount: '',

    bursary: null,
    bursaryAmount: '',
    bursaryDates: [...DEFAULT_BURSARY_DATES],

    oneOffItems: [{ name: '', amount: '', date: '', direction: 'out' }],

    weeklySpend: '75',
    weeklySpendNonTerm: '',
    weeklySpendVariesByTerm: false,
}
