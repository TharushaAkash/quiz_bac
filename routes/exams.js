const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const Exam = require('../models/Exam');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// @route   POST api/exams
// @desc    Create an exam (Admin only)
router.post('/', auth, admin, async (req, res) => {
    try {
        const newExam = new Exam({ ...req.body, createdBy: req.user.id });
        const exam = await newExam.save();
        res.status(201).json(exam);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/exams
// @desc    Get all exams
router.get('/', auth, async (req, res) => {
    try {
        const exams = await Exam.find().select('-questions.correctOption');
        res.json(exams);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/exams/:id
// @desc    Get exam details
router.get('/:id', auth, async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });
        res.json(exam);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/exams/:id
// @desc    Delete an exam (Admin only)
router.delete('/:id', auth, admin, async (req, res) => {
    try {
        await Exam.findByIdAndDelete(req.params.id);
        res.json({ message: 'Exam deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Multer setup
const upload = multer({ dest: 'uploads/' });

// @route   POST api/exams/upload
// @desc    Upload exams via CSV or Excel
router.post('/upload', auth, admin, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const filePath = req.file.path;
    const { title, description, duration } = req.body;
    let questions = [];

    const mapRowToQuestion = (row) => {
        const questionText = row.question || row.Question || row.questionText;
        const type = row.type || 'MCQ-Multiple';
        const codeSnippet = row.code_snippet || row.codeSnippet;

        const options = [
            row.option_A || row['Option A'] || row.option1,
            row.option_B || row['Option B'] || row.option2,
            row.option_C || row['Option C'] || row.option3,
            row.option_D || row['Option D'] || row.option4,
            row.option_E || row['Option E'] || row.option5
        ].filter(opt => opt !== undefined && opt !== null && opt.toString().trim() !== '');

        const correctOptions = [];
        const rawCorrect = (row.correct_answers || row['Correct Answer(s)'] || row.correctOption || '').toString().trim().toUpperCase();

        if (rawCorrect) {
            const parts = rawCorrect.split(/[|,]/);
            parts.forEach(p => {
                const clean = p.trim();
                if (clean === 'A') correctOptions.push(0);
                else if (clean === 'B') correctOptions.push(1);
                else if (clean === 'C') correctOptions.push(2);
                else if (clean === 'D') correctOptions.push(3);
                else if (clean === 'E') correctOptions.push(4);
                else {
                    const num = parseInt(clean);
                    if (!isNaN(num)) correctOptions.push(num);
                }
            });
        }

        return {
            questionText,
            type,
            options,
            correctOptions,
            codeSnippet,
            correctAnswer: row.correct_answers || rawCorrect
        };
    };

    const processAndSave = async (data) => {
        try {
            questions = data
                .filter(row => {
                    const qText = (row.question || row.Question || row.questionText)?.toString().trim();
                    const type = (row.type || '').toString();
                    if (type.includes('Short')) return !!qText;

                    const opt1 = row.option_A || row['Option A'] || row.option1;
                    const opt2 = row.option_B || row['Option B'] || row.option2;
                    return qText && opt1 && opt2; // Need at least 2 options for MCQ
                })
                .map(mapRowToQuestion);

            if (questions.length === 0) {
                throw new Error('No valid questions found in file');
            }

            const newExam = new Exam({ title, description, duration, questions, createdBy: req.user.id });
            await newExam.save();
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            res.status(201).json(newExam);
        } catch (err) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            console.error('File processing error:', err);
            res.status(500).json({ message: err.message || 'Error processing file' });
        }
    };

    try {
        if (req.file.originalname.endsWith('.csv')) {
            const results = [];
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => processAndSave(results));
        } else {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet);
            await processAndSave(data);
        }
    } catch (err) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error('Upload error:', err);
        res.status(500).json({ message: 'Error uploading file' });
    }
});

module.exports = router;
