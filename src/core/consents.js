export const CONSENTS = [
    {
        id: 'manual_data',
        required: true,
        title: 'How we use your data',
        description: [
            'We collect this information to generate your personalised financial forecast and direct you to the appropriate university support.',
            'Our legal basis for processing this data is Consent.',
            'We will not use this data for marketing or sell it to third parties.'
        ],
        checkboxLabel:
            'I consent to Budge Up processing my financial data to generate a support plan.',
        footer:
            'You have the right to withdraw consent at any time. To have your data deleted, email support@budgeup.co.uk. We will delete all pilot data within 30 days of the project’s conclusion.'
    },

    {
        id: 'financial_analysis',
        required: true,
        title: 'Financial analysis',
        description: [
            'We analyse your financial information to identify risks, upcoming shortfalls, and potential support options.'
        ],
        checkboxLabel:
            'I consent to Budge Up analysing my financial data to generate insights.'
    },
    {
        id: 'open_banking',
        required: false,
        title: 'Open banking (optional)',
        description: [
            'If you choose to connect your bank account, we will securely access your transaction data using an FCA-regulated provider.',
            'This helps us give you a more accurate and personalised financial forecast.'
        ],
        checkboxLabel:
            'I consent to Budge Up accessing my bank data via open banking.'
    }
]