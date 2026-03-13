const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    questionText: { type: String, required: true },
    type: { type: String, default: 'MCQ-Single' }, // MCQ-Single, MCQ-Multiple, Short/Output
    options: [{ type: String }],
    correctOptions: [{ type: Number }], // For MCQ
    correctAnswer: { type: String }, // For Short/Output
    codeSnippet: { type: String },
});

const examSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    duration: { type: Number, required: true }, // in minutes
    questions: [questionSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Exam', examSchema);
