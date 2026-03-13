const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// @route   GET api/users
// @desc    Get all users (Admin only)
router.get('/', auth, admin, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/users/:id
// @desc    Delete a user (Admin only)
router.delete('/:id', auth, admin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/users/profile
// @desc    Get current user profile
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/users/profile
// @desc    Update current user profile
router.put('/profile', auth, async (req, res) => {
    const { name, email, universityYear } = req.body;
    try {
        const user = await User.findById(req.user.id);
        if (name) user.name = name;
        if (email) user.email = email;
        if (universityYear) user.universityYear = universityYear;

        await user.save();
        res.json({ message: 'Profile updated', user: { id: user._id, name: user.name, email: user.email, role: user.role, universityYear: user.universityYear } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/users/:id
// @desc    Update user details (Admin only)
router.put('/:id', auth, admin, async (req, res) => {
    const { name, email, universityYear, role, isBlocked } = req.body;
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (name) user.name = name;
        if (email) user.email = email;
        if (universityYear) user.universityYear = universityYear;
        if (role) user.role = role;
        if (typeof isBlocked !== 'undefined') user.isBlocked = isBlocked;

        await user.save();
        res.json({ message: 'User updated', user });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
