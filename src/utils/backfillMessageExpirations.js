const Message = require('../models/Message');

const backfillMessageExpirations = async () => {
  await Message.updateMany(
    {
      expiresAt: { $exists: false }
    },
    [
      {
        $set: {
          expiresAt: {
            $dateAdd: {
              startDate: '$createdAt',
              unit: 'day',
              amount: 5
            }
          }
        }
      }
    ]
  );
};

module.exports = backfillMessageExpirations;
