const { Op } = require('sequelize');
const { Board, User, Column, Task, BoardMember, sequelize } = require('../models');

// ─── POST / ── Create a new board ───
exports.createBoard = async (req, res) => {
  // Wrap board + owner-membership in a transaction so we never end up with
  // an "orphan" board that the creator can't see in their list.
  const t = await sequelize.transaction();
  try {
    const { title, description } = req.body;

    if (!title) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'title is required' });
    }

    const board = await Board.create(
      {
        title,
        description,
        creator_id: req.user.id,
      },
      { transaction: t }
    );

    // Add the creator as an owner-level member so getBoards (which queries
    // through BoardMember) can find this board for them on the next request.
    await BoardMember.create(
      {
        user_id: req.user.id,
        board_id: board.id,
        role: 'owner',
        status: 'accepted',
      },
      { transaction: t }
    );

    await t.commit();
    return res.status(201).json({ status: 'success', data: { board } });
  } catch (err) {
    await t.rollback();
    console.error('createBoard error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not create board' });
  }
};

// ─── GET / ── Fetch boards the logged-in user owns or is a member of ───
exports.getBoards = async (req, res) => {
  try {
    const boards = await Board.findAll({
      where: {
        [Op.or]: [
          // 1) Boards I created (covers legacy boards with no membership row)
          { creator_id: req.user.id },
          // 2) Boards I have an *accepted* membership for
          //    (pending/rejected invites must NOT show up in the boards list)
          {
            id: {
              [Op.in]: sequelize.literal(
                `(SELECT board_id FROM board_members WHERE user_id = :userId AND status = 'accepted')`
              ),
            },
          },
        ],
      },
      include: {
        model: User,
        as: 'creator',
        attributes: ['id', 'full_name', 'email'],
      },
      order: [['created_at', 'DESC']],
      replacements: { userId: req.user.id },
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
