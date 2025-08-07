import { NextRequest, NextResponse } from 'next/server';
import { 
  sendEmail,
  sendShiftConfirmationEmail,
  sendEmergencyShiftRequestEmail,
  sendNotificationEmail,
  sendTodayShiftNotificationEmail,
  sendSubstituteApprovedEmail,
  sendShiftRequestConfirmationEmail,
  sendShiftRequestReminderEmail
} from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, ...emailData } = body;

    switch (type) {
      case 'basic':
        const { to, subject, html, text, from } = emailData;
        await sendEmail({ to, subject, html, text, from });
        break;

      case 'shift-confirmation':
        const { userEmail: shiftEmail, userName: shiftUser, shifts } = emailData;
        await sendShiftConfirmationEmail(shiftEmail, shiftUser, shifts);
        break;

      case 'emergency-request':
        const { userEmails, details } = emailData;
        await sendEmergencyShiftRequestEmail(userEmails, details);
        break;

      case 'notification':
        const { 
          userEmail: notificationEmail, 
          userName: notificationUser, 
          title, 
          message 
        } = emailData;
        await sendNotificationEmail(
          notificationEmail, 
          notificationUser, 
          title, 
          message
        );
        break;

      case 'today-shift-notification':
        const { 
          userEmail: todayEmail, 
          userName: todayUser, 
          todayShifts 
        } = emailData;
        await sendTodayShiftNotificationEmail(
          todayEmail, 
          todayUser, 
          todayShifts
        );
        break;

      case 'substitute-approved':
        const {
          approvedUserEmail,
          approvedUserName,
          originalUserEmail,
          originalUserName,
          details: substituteDetails
        } = emailData;
        await sendSubstituteApprovedEmail(
          approvedUserEmail,
          approvedUserName,
          originalUserEmail,
          originalUserName,
          substituteDetails
        );
        break;

      case 'shift-request-confirmation':
        const {
          userEmail: confirmationEmail,
          userName: confirmationUser,
          submissionPeriod,
          submittedRequestsCount
        } = emailData;
        await sendShiftRequestConfirmationEmail(
          confirmationEmail,
          confirmationUser,
          submissionPeriod,
          submittedRequestsCount
        );
        break;

      case 'shift-request-reminder':
        const {
          userEmail: reminderEmail,
          userName: reminderUser,
          submissionPeriod: reminderPeriod,
          deadline
        } = emailData;
        await sendShiftRequestReminderEmail(
          reminderEmail,
          reminderUser,
          reminderPeriod,
          deadline
        );
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid email type' },
          { status: 400 }
        );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Email sent successfully' 
    });

  } catch (error) {
    console.error('Email API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to send email',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 