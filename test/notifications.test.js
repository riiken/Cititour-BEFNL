jest.mock('../config/mailer', () => ({
  sendMailSafe: jest.fn().mockResolvedValue(true),
  appUrl: () => 'https://cititour.example',
  adminEmails: () => ['boss@example.com']
}));

const db = require('./db');
const User = require('../model/User');
const { sendMailSafe } = require('../config/mailer');
const notifications = require('../services/notificationService');

beforeAll(db.connect);
afterEach(async () => { await db.clear(); jest.clearAllMocks(); });
afterAll(db.close);

const makeOwner = () => User.create({ name: 'Asha', email: 'asha@example.com', password: 'Str0ngPassword1' });

describe('listing notifications', () => {
  it('tells admins about new listings', async () => {
    await notifications.notifyAdminsNewListing({ name: 'Lake View', type: 'stay', city: 'Udaipur' });
    expect(sendMailSafe).toHaveBeenCalledWith(expect.objectContaining({
      to: 'boss@example.com',
      subject: expect.stringContaining('Lake View'),
      text: expect.stringContaining('https://cititour.example/admin')
    }));
  });

  it('sends the owner their public page link on approval', async () => {
    const owner = await makeOwner();
    await notifications.notifyOwnerApproved({ _id: 'abc123', ownerId: owner._id, name: 'Lake View', city: 'Udaipur' });
    expect(sendMailSafe).toHaveBeenCalledWith(expect.objectContaining({
      to: 'asha@example.com',
      text: expect.stringContaining('https://cititour.example/place/abc123')
    }));
  });

  it('escapes the rejection reason in the HTML email', async () => {
    const owner = await makeOwner();
    await notifications.notifyOwnerRejected({
      _id: 'abc123', ownerId: owner._id, name: 'Lake View', rejectionReason: '<b>Add photos</b>'
    });
    const mail = sendMailSafe.mock.calls[0][0];
    expect(mail.html).toContain('&lt;b&gt;Add photos&lt;/b&gt;');
    expect(mail.text).toContain('/partner/edit/abc123');
  });
});
