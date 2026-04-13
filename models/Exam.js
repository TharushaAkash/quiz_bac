const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    questionText: { type: String, required: true },
    type: { type: String, default: 'MCQ-Single' }, // MCQ-Single, MCQ-Multiple, Short/Output, Code-Evaluation
    options: [{ type: String }],
    correctOptions: [{ type: Number }], // For MCQ
    correctAnswer: { type: String }, // For Short/Output
    codeSnippet: { type: String },
    marks: { type: Number, default: 0 }, // For Code-Evaluation questions
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
