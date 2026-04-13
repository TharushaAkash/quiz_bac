const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const Exam = require('../models/Exam');
const auth = require('../middleware/auth');
const multer = require('multer');
const AdmZip = require('adm-zip');
const axios = require('axios');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // increased to 50MB

// @route   POST api/results/extract-zip
// @desc    Extract uploaded ZIP file and return joined text buffer
router.post('/extract-zip', auth, (req, res) => {
    upload.single('zipFile')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: `Upload error: ${err.message}. Please upload a smaller zip.` });
        } else if (err) {
            return res.status(500).json({ message: 'Unknown upload error.' });
        }

        try {
            if (!req.file) return res.status(400).json({ message: 'No zip file uploaded' });

            const zip = new AdmZip(req.file.buffer);
            const zipEntries = zip.getEntries();
            let combinedText = '';

            zipEntries.forEach(zipEntry => {
                if (!zipEntry.isDirectory) {
                    const fileName = zipEntry.entryName;
                    if (fileName.includes('node_modules/') || fileName.includes('.git/') || fileName.includes('.DS_Store')) return;

                    const ext = fileName.split('.').pop().toLowerCase();
                    const binaryExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'pdf', 'zip', 'tar', 'gz', 'mp3', 'mp4', 'woff', 'woff2', 'ttf', 'eot'];
                    if (binaryExts.includes(ext)) return;

                    const fileText = zipEntry.getData().toString('utf8');
                    combinedText += `\n/* ---- File: ${fileName} ---- */\n${fileText}\n`;
                }
            });

            res.json({ extractedText: combinedText.trim() });
        } catch (e) {
            console.error('ZIP Extraction error:', e);
            res.status(500).json({ message: 'Failed to extract ZIP. Ensure it is a valid .zip archive and not corrupted.' });
        }
    });
});

// @route   POST api/results
// @desc    Submit an exam attempt
router.post('/', auth, async (req, res) => {
    const { examId, answers, aiModel } = req.body;
    try {
        const exam = await Exam.findById(examId);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        let score = 0;
        let totalMarksAvailable = 0;
        let totalMarksAwarded = 0;

        const processedAnswers = await Promise.all(exam.questions.map(async (q, index) => {
            const studentAnswerRaw = answers[index];
            let isCorrect = false;

            let studentCodeText = undefined;
            let aiFeedback = undefined;
            let syntaxErrors = undefined;
            let marksAwarded = 0;

            if (q.type === 'Code-Evaluation') {
                totalMarksAvailable += (q.marks || 0);
                studentCodeText = (studentAnswerRaw || '').toString();

                if (!studentCodeText.trim()) {
                    aiFeedback = 'No code submitted.';
                    syntaxErrors = 'None';
                    marksAwarded = 0;
                } else if (process.env.OPENROUTER_API_KEY) {
                    try {
                        const prompt = `Review this code submission:
Question: "${q.questionText}"
Max Marks: ${q.marks || 0}
Student Code:
\`\`\`
${studentCodeText}
\`\`\`
Requirements:
1. First, strictly verify if the code actually attempts to solve the provided Question. If the code is completely unrelated to the Question, assign 0 marks and state this in the feedback.
2. Assign marks out of ${q.marks || 0} based on logic, correctness, and question relevance.
3. Provide a short overall qualitative feedback. Do NOT provide long paragraphs. Use concise sentences.
4. If there are syntax errors or warnings, list them strictly in this format:
   "Code Line that has the error" - Explanation of the error and how to fix it.
   Do this for every error found sequentially.

Return exactly this JSON structure (do not use markdown blocks around the response, just return valid JSON string):
{"marks":<number>,"feedback":"<string>","syntaxErrors":"<string>"}`;

                        const modelToUse = aiModel || "google/gemma-3-27b-it:free";
                        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                            model: modelToUse,
                            messages: [{ role: "user", content: prompt }]
                        }, {
                            headers: {
                                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                                "Content-Type": "application/json",
                                "HTTP-Referer": "http://localhost:5173",
                                "X-Title": "QuizeMaster Code Evaluator"
                            }
                        });

                        // Parse JSON from text
                        const aiText = response.data.choices[0].message.content;
                        const cleanText = aiText.replace(/^[^{]*{/, '{').replace(/}[^}]*$/, '}');
                        const aiResult = JSON.parse(cleanText);

                        aiFeedback = aiResult.feedback || 'Evaluated.';
                        syntaxErrors = aiResult.syntaxErrors || 'None';
                        marksAwarded = aiResult.marks || 0;
                        totalMarksAwarded += marksAwarded;
                    } catch (e) {
                        console.error('AI Evaluation failed', e.response?.data || e.message);
                        if (e.response && (e.response.status === 402 || e.response.status === 429)) {
                            const apiError = new Error(`Model Error: ${aiModel || 'Selected Model'} is unavailable or requires credits. Please select a different Free model from the dropdown.`);
                            apiError.status = 400;
                            throw apiError;
                        } else if (e.response && (e.response.status === 404 || e.response.status === 400)) {
                            const openRouterMsg = e.response.data?.error?.message || 'Invalid Request';
                            const apiError = new Error(`OpenRouter API Rejected the Model: ${openRouterMsg}. Please try a different Free model.`);
                            apiError.status = 400;
                            throw apiError;
                        }
                        aiFeedback = `AI Evaluation failed due to an error: ${e.message}.`;
                        syntaxErrors = 'Unknown';
                    }
                } else {
                    aiFeedback = 'AI Verification Unavailable (API Key Missing)';
                    syntaxErrors = 'Pending';
                    marksAwarded = 0;
                }

            } else if (q.type && q.type.includes('Short')) {
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
                selectedOptions: (q.type === 'Code-Evaluation' || (q.type && q.type.includes('Short'))) ? [] : (Array.isArray(studentAnswerRaw) ? studentAnswerRaw : (studentAnswerRaw !== undefined && studentAnswerRaw !== null ? [studentAnswerRaw] : [])),
                isCorrect,
                studentCodeText,
                aiFeedback,
                syntaxErrors,
                marksAwarded
            };
        }));

        const result = new Result({
            user: req.user.id,
            exam: examId,
            score,
            totalQuestions: exam.questions.length,
            answers: processedAnswers,
            totalMarksAvailable,
            totalMarksAwarded
        });
        const savedResult = await result.save();
        res.status(201).json(savedResult);
    } catch (err) {
        console.error('Submission processing error:', err.message);
        if (err.status === 400) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: 'Server error: ' + err.message });
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
