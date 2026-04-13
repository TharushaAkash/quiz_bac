const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    answers: [{
        questionId: { type: mongoose.Schema.Types.ObjectId },
        selectedOptions: [{ type: Number }], // Array of indices selected
        isCorrect: { type: Boolean },
        studentCodeText: { type: String }, // For Code-Evaluation
        aiFeedback: { type: String },       // For Code-Evaluation
        syntaxErrors: { type: String },     // For Code-Evaluation
        marksAwarded: { type: Number }      // For Code-Evaluation
    }],
    totalMarksAwarded: { type: Number, default: 0 }, // Only relevant for code exams
    totalMarksAvailable: { type: Number, default: 0 }, // Only relevant for code exams
    completedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', resultSchema);
