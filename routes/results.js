const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const Exam = require('../models/Exam');
const auth = require('../middleware/auth');

// @route   POST api/results
// @desc    Submit an exam attempt
router.post('/', auth, async (req, res) => {
    const { examId, answers } = req.body;
    try {
        const exam = await Exam.findById(examId);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        let score = 0;
        const processedAnswers = exam.questions.map((q, index) => {
            const studentAnswerRaw = answers[index];
            let isCorrect = false;

            if (q.type && q.type.includes('Short')) {
                // Short/Output comparison (case-insensitive)
                const sAns = (studentAnswerRaw || '').toString().trim().toLowerCase();
                const cAns = (q.correctAnswer || '').toString().trim().toLowerCase();
                isCorrect = cAns !== '' && sAns === cAns;
            } else {
                // MCQ comparison (Array of indices)
                const studentAnswers = Array.isArray(studentAnswerRaw)
                    ? studentAnswerRaw
                    : (studentAnswerRaw !== undefined && studentAnswerRaw !== null ? [studentAnswerRaw] : []);

                const sortedStudent = [...studentAnswers].map(Number).sort((a, b) => a - b);
                const sortedCorrect = [...(q.correctOptions || [])].map(Number).sort((a, b) => a - b);

                isCorrect = sortedCorrect.length > 0 && JSON.stringify(sortedStudent) === JSON.stringify(sortedCorrect);
            }

            if (isCorrect) score++;

            return {
                questionId: q._id,
                selectedOptions: Array.isArray(studentAnswerRaw) ? studentAnswerRaw : (studentAnswerRaw ? [studentAnswerRaw] : []),
                isCorrect
            };
        });

        const result = new Result({
            user: req.user.id,
            exam: examId,
            score,
            totalQuestions: exam.questions.length,
            answers: processedAnswers
        });

        await result.save();
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/results/user
// @desc    Get user results
router.get('/user', auth, async (req, res) => {
    try {
        const results = await Result.find({ user: req.user.id }).populate('exam', 'title');
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/results/:id
// @desc    Get result detail for review
router.get('/:id', auth, async (req, res) => {
    try {
        const result = await Result.findOne({ _id: req.params.id, user: req.user.id })
            .populate('exam');

        if (!result) return res.status(404).json({ message: 'Result not found' });
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/results/:id
// @desc    Delete result
router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await Result.findById(req.params.id);
        if (!result) return res.status(404).json({ message: 'Result not found' });

        // Ensure user owns the result or is admin
        if (result.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        await Result.findByIdAndDelete(req.params.id);
        res.json({ message: 'Result deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
