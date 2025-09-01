import { NextRequest, NextResponse } from 'next/server';
import { 
  sendEmail,
  sendShiftConfirmationEmail,
  sendEmergencyShiftRequestEmail,
  sendNotificationEmail,
  sendTodayShiftNotificationEmail,
  sendSubstituteApprovedEmail,
  sendSubstituteRejectedEmail,
  sendShiftRequestConfirmationEmail,
  sendShiftRequestReminderEmail,
  sendManagerShiftRequestNotificationEmail,
  sendManagerEmergencyVolunteerNotificationEmail,
  sendShiftChangeNotificationEmail,
  sendManagerShiftConfirmationEmail,
  sendManagerSubstituteConfirmationEmail
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
        console.log('📧 shift-confirmation メール送信開始:', {
          email: shiftEmail,
          user: shiftUser,
          shiftsCount: shifts?.length
        });
        await sendShiftConfirmationEmail(shiftEmail, shiftUser, shifts);
        console.log('✅ shift-confirmation メール送信完了:', shiftEmail);
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

      case 'manager-shift-request-notification':
        const {
          userEmail: managerEmail,
          userName: managerName,
          staffName,
          submissionPeriod: notificationPeriod,
          submittedRequestsCount: requestCount
        } = emailData;
        await sendManagerShiftRequestNotificationEmail(
          managerEmail,
          managerName,
          staffName,
          notificationPeriod,
          requestCount
        );
        break;

      case 'manager-emergency-volunteer-notification':
        const {
          userEmail: managerVolunteerEmail,
          userName: managerVolunteerName,
          details: volunteerDetails
        } = emailData;
        await sendManagerEmergencyVolunteerNotificationEmail(
          managerVolunteerEmail,
          managerVolunteerName,
          volunteerDetails
        );
        break;

      case 'shift-change-notification':
        const {
          userEmail: changeEmail,
          userName: changeUser,
          details: changeDetails
        } = emailData;
        await sendShiftChangeNotificationEmail(
          changeEmail,
          changeUser,
          changeDetails
        );
        break;

      case 'substitute-rejected':
        const {
          userEmail: rejectedEmail,
          userName: rejectedUser,
          details: rejectedDetails
        } = emailData;
        await sendSubstituteRejectedEmail(
          rejectedEmail,
          rejectedUser,
          rejectedDetails
        );
        break;

      case 'manager-shift-confirmation':
        const {
          userEmail: managerShiftEmail,
          userName: managerShiftName,
          details: shiftConfirmationDetails
        } = emailData;
        await sendManagerShiftConfirmationEmail(
          managerShiftEmail,
          managerShiftName,
          shiftConfirmationDetails
        );
        break;

      case 'manager-substitute-confirmation':
        const {
          userEmail: managerSubEmail,
          userName: managerSubName,
          details: subConfirmationDetails
        } = emailData;
        await sendManagerSubstituteConfirmationEmail(
          managerSubEmail,
          managerSubName,
          subConfirmationDetails
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