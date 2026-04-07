const { Board, User, Column, Task } = require('../models');

// ─── POST / ── Create a new board ───
exports.createBoard = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ status: 'error', message: 'title is required' });
    }

    const board = await Board.create({
      title,
      description,
      creator_id: req.user.id,
    });

    return res.status(201).json({ status: 'success', data: { board } });
  } catch (err) {
    console.error('createBoard error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not create board' });
  }
};

// ─── GET / ── Fetch all boards ───
exports.getBoards = async (req, res) => {
  try {
    const boards = await Board.findAll({
      include: {
        model: User,
        as: 'creator',
        attributes: ['id', 'full_name', 'email'],
      },
      order: [['created_at', 'DESC']],
    });

    return res.json({ status: 'success', data: { boards } });
  } catch (err) {
    console.error('getBoards error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch boards' });
  }
};

// ─── GET /:id ── Fetch a single board with columns → tasks ───
exports.getBoardById = async (req, res) => {
  try {
    const board = await Board.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'full_name', 'email'],
        },
        {
          model: Column,
          as: 'columns',
          separate: true,
          order: [['position', 'ASC']],
          include: {
            model: Task,
            as: 'tasks',
            separate: true,
            order: [['position', 'ASC']],
            include: {
              model: User,
              as: 'assignees',
              attributes: ['id', 'full_name', 'email'],
              through: { attributes: [] },
            },
          },
        },
      ],
    });

    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    return res.json({ status: 'success', data: { board } });
  } catch (err) {
    console.error('getBoardById error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch board' });
  }
};
