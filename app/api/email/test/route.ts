import { NextRequest, NextResponse } from 'next/server';
import { runAllEmailTests, testBasicEmail } from '@/lib/email-test';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testEmail, testType = 'all' } = body;

    if (!testEmail) {
      return NextResponse.json(
        { error: 'Test email address is required' },
        { status: 400 }
      );
    }

    // メールアドレスの基本的なバリデーション
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      return NextResponse.json(
        { error: 'Invalid email address format' },
        { status: 400 }
      );
    }

    let results;

    if (testType === 'basic') {
      results = await testBasicEmail(testEmail);
    } else {
      results = await runAllEmailTests(testEmail);
    }

    return NextResponse.json({
      success: true,
      message: 'Email test completed',
      results,
      testEmail,
      testType,
    });

  } catch (error) {
    console.error('Email test API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to run email test',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET リクエストで簡単なテストページを返す
export async function GET() {
  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>メール送信テスト - シフト管理システム</title>
      <style>
        body {
          font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          line-height: 1.6;
        }
        .container {
          background: #f8fafc;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        h1 {
          color: #3b82f6;
          text-align: center;
          margin-bottom: 30px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
          color: #374151;
        }
        input, select {
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 16px;
          box-sizing: border-box;
        }
        button {
          background: #3b82f6;
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          width: 100%;
          margin-top: 10px;
        }
        button:hover {
          background: #2563eb;
        }
        button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        .result {
          margin-top: 20px;
          padding: 15px;
          border-radius: 8px;
          white-space: pre-wrap;
          font-family: monospace;
        }
        .success {
          background: #d1fae5;
          border: 1px solid #10b981;
          color: #064e3b;
        }
        .error {
          background: #fee2e2;
          border: 1px solid #ef4444;
          color: #7f1d1d;
        }
        .warning {
          background: #fef3c7;
          border: 1px solid #f59e0b;
          color: #78350f;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📧 メール送信テスト</h1>
        
        <div class="warning">
          <strong>⚠️ 注意:</strong> これはテスト用のページです。本番環境では削除してください。
        </div>
        
        <form id="emailTestForm">
          <div class="form-group">
            <label for="testEmail">テスト送信先メールアドレス:</label>
            <input type="email" id="testEmail" name="testEmail" required 
                   placeholder="test@example.com">
          </div>
          
          <div class="form-group">
            <label for="testType">テストタイプ:</label>
            <select id="testType" name="testType">
              <option value="basic">基本メール送信のみ</option>
              <option value="all">全ての機能をテスト</option>
            </select>
          </div>
          
          <button type="submit" id="submitBtn">テスト実行</button>
        </form>
        
        <div id="result"></div>
      </div>

      <script>
        document.getElementById('emailTestForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const submitBtn = document.getElementById('submitBtn');
          const resultDiv = document.getElementById('result');
          const testEmail = document.getElementById('testEmail').value;
          const testType = document.getElementById('testType').value;
          
          submitBtn.disabled = true;
          submitBtn.textContent = 'テスト実行中...';
          resultDiv.innerHTML = '';
          
          try {
            const response = await fetch('/api/email/test', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ testEmail, testType }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
              resultDiv.className = 'result success';
              resultDiv.textContent = 
                '✅ テスト完了\\n\\n' +
                'メールアドレス: ' + data.testEmail + '\\n' +
                'テストタイプ: ' + data.testType + '\\n\\n' +
                JSON.stringify(data.results, null, 2);
            } else {
              resultDiv.className = 'result error';
              resultDiv.textContent = '❌ エラー: ' + data.message;
            }
          } catch (error) {
            resultDiv.className = 'result error';
            resultDiv.textContent = '❌ ネットワークエラー: ' + error.message;
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'テスト実行';
          }
        });
      </script>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
} 