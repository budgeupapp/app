/* ---------- ONBOARDING STEPS ---------- */

export const STEPS = [
    {
        id: 'university',
        heading: 'Which university do you attend?',
        subtitle: "This helps us connect you with your university's financial support team."
    },
    {
        id: 'balance',
        heading: "What's your current bank balance?",
        subtitle: 'Your best estimate is fine.'
    },
    {
        id: 'savings',
        heading: 'How much money do you have in savings?',
        subtitle:
            'This helps us understand your financial cushion and recommend appropriate budgeting strategies.'
    },
    {
        id: 'studentLoan',
        heading: 'Do you receive student loans?',
        subtitle: 'This helps us understand your main income source.'
    },
    {
        id: 'bursary',
        heading: 'Do you receive any bursaries?',
        subtitle: 'Include university bursaries or grants.'
    },
    {
        id: 'otherIncome',
        heading: 'Do you receive any other regular income?',
        subtitle: 'For example, from part-time job, family, or other sources.'
    },
    {
        id: 'regularExpense',
        heading: 'Do you have any regular expenses?',
        subtitle:
            'Include rent, bills, subscriptions, or anything you pay for regularly. Enter the date of the next one — a rough estimate is fine.'
    },
    {
        id: 'oneOffPayments',
        heading: 'Any one-off income or expenses coming up?',
        subtitle:
            'For example, trips, events, larger purchases, or any expected lump-sum income.'
    },
    {
        id: 'weeklySpend',
        heading: 'How much do you typically spend each week?',
        subtitle: 'Excluding rent and bills.'
    }
]

/* ---------- OPTIONS ---------- */

export const WEEKLY_SPEND_OPTIONS = [
    { value: 1, label: '£50–£80 (very frugal)' },
    { value: 2, label: '£80–£120 (typical Bristol student)' },
    { value: 3, label: '£120–£180 (social & eating out)' },
    { value: 4, label: '£180+ (very social / lifestyle-heavy)' }
]

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
    { value: 'termly', label: 'Termly' },
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

export const INITIAL_FORM_DATA = {
    university: 'University of Bristol',
    balance: '',
    savings: '',

    studentLoan: null,
    loanAmount: '',
    loanMonths: [...DEFAULT_LOAN_MONTHS],
    loanKnowDates: false,
    loanDates: {},

    bursary: null,
    bursaryAmount: '',
    bursaryDates: [...DEFAULT_BURSARY_DATES],

    otherIncome: null,
    otherIncomeItems: [{ type: 'part_time_job', amount: '', date: '', frequency: 'monthly', endDate: '' }],

    regularExpense: null,
    regularExpenseItems: [
        { amount: '', date: '', frequency: 'monthly', type: 'rent', endDate: '' }
    ],

    oneOffPayments: null,
    oneOffIn: [{ name: '', amount: '', date: '' }],
    oneOffOut: [{ name: '', amount: '', date: '' }],

    weeklySpend: ''
}
