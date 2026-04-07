const { Column, Board } = require('../models');

// ─── POST / ── Create a column for a board ───
exports.createColumn = async (req, res) => {
  try {
    const { board_id, title, position } = req.body;

    if (!board_id || !title) {
      return res.status(400).json({ status: 'error', message: 'board_id and title are required' });
    }

    const board = await Board.findByPk(board_id);
    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    // If no position provided, append to the end
    let finalPosition = position;
    if (finalPosition === undefined || finalPosition === null) {
      const maxPos = await Column.max('position', { where: { board_id } });
      finalPosition = (maxPos ?? -1) + 1;
    }

    const column = await Column.create({ board_id, title, position: finalPosition });

    return res.status(201).json({ status: 'success', data: { column } });
  } catch (err) {
    console.error('createColumn error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not create column' });
  }
};

// ─── PUT /:id ── Update column title / position ───
exports.updateColumn = async (req, res) => {
  try {
    const column = await Column.findByPk(req.params.id);
    if (!column) {
      return res.status(404).json({ status: 'error', message: 'Column not found' });
    }

    const { title, position } = req.body;

    if (title !== undefined) column.title = title;
    if (position !== undefined) column.position = position;

    await column.save();

    return res.json({ status: 'success', data: { column } });
  } catch (err) {
    console.error('updateColumn error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update column' });
  }
};

// ─── DELETE /:id ── Remove a column (tasks cascade-delete via DB) ───
exports.deleteColumn = async (req, res) => {
  try {
    const column = await Column.findByPk(req.params.id);
    if (!column) {
      return res.status(404).json({ status: 'error', message: 'Column not found' });
    }

    await column.destroy();

    return res.json({ status: 'success', message: 'Column deleted' });
  } catch (err) {
    console.error('deleteColumn error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not delete column' });
  }
};
