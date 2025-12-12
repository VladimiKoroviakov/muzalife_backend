import { sendVerificationEmail, generateVerificationCode } from './utils/emailService.js';

const testCompleteFlow = async () => {
  console.log('🧪 Testing Complete Payment Flow...\n');
  
  const testEmail = 'mr.vladimir.vl8@gmail.com'; // Your email for testing
  const code = generateVerificationCode();
  
  console.log('Step 1: Sending verification email...');
  console.log('To:', testEmail);
  console.log('Code:', code);
  
  const emailResult = await sendVerificationEmail(testEmail, code);
  
  if (emailResult.success) {
    console.log('✅ Step 1: Email sent successfully!');
    console.log('💡 Check your email for the verification code');
    
    // Simulate Step 2: Code verification
    console.log('\nStep 2: Code verification would happen here...');
    console.log('User would enter the code and get LiqPay checkout URL');
    
  } else {
    console.log('❌ Step 1: Failed to send email:', emailResult.error);
  }
};

testCompleteFlow();