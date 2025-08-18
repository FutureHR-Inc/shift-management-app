'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type LoginType = 'manager' | 'staff';

export default function LoginPage() {
  const [loginType, setLoginType] = useState<LoginType>('staff');
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showManagerRegister, setShowManagerRegister] = useState(false);
  const [managerName, setManagerName] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 1. 入力値チェック
      const loginCredential = loginType === 'manager' ? email : loginId;
      if (!loginCredential.trim()) {
        throw new Error(loginType === 'manager' ? 'メールアドレスを入力してください' : 'スタッフIDを入力してください');
      }

      if (!password) {
        throw new Error('パスワードを入力してください');
      }

      // 2. APIでユーザー情報を取得（ログインタイプも含める）
      const queryParam = loginType === 'manager' ? `email=${email}&login_type=manager` : `login_id=${loginId}&login_type=staff`;
      const response = await fetch(`/api/users?${queryParam}`);
      if (!response.ok) {
        throw new Error(loginType === 'manager' ? 'メールアドレスが見つかりません' : 'スタッフIDが見つかりません');
      }

      const result = await response.json();
      
      if (!result.data || result.data.length === 0) {
        throw new Error('ログインIDが見つかりません');
      }

      const user = result.data[0];

      // 3. 初回ログインかどうかチェック
      if (user.is_first_login) {
        setIsFirstLogin(true);
        return;
      }

      // 4. パスワード認証
      const authResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login_credential: loginCredential,
          login_type: loginType,
          password: password,
        }),
      });

      if (!authResponse.ok) {
        throw new Error('ログインIDまたはパスワードが正しくありません');
      }

      // const authResult = await authResponse.json(); // 未使用のため削除

      // 5. ログイン成功時、ユーザー情報をローカルストレージに保存
      const userInfo = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        loginId: loginId,
        stores: user.user_stores?.map((us: { store_id: string }) => us.store_id) || []
      };

      localStorage.setItem('currentUser', JSON.stringify(userInfo));

      // 6. 企業ID確認とロール別リダイレクト
      if (user.role === 'manager') {
        if (!user.company_id) {
          // 企業ID未設定の管理者 → スタッフ管理画面の企業登録タブへ
          router.push('/staff?tab=company-registration');
        } else {
          // 企業ID設定済み → 管理者ダッシュボードへ
          router.push('/dashboard');
        }
      } else {
        if (!user.company_id) {
          // 企業ID未設定のスタッフ → 待機画面へ
          router.push('/waiting-for-company');
        } else {
          // 企業ID設定済み → スタッフダッシュボードへ
          router.push('/staff-dashboard');
        }
      }

    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('ログインに失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFirstTimePasswordSet = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // パスワード確認チェック
      if (password !== confirmPassword) {
        throw new Error('パスワードが一致しません');
      }

      if (password.length < 6) {
        throw new Error('パスワードは6文字以上で入力してください');
      }

      // パスワード設定API
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login_id: loginId,
          password: password,
        }),
      });

      if (!response.ok) {
        throw new Error('パスワード設定に失敗しました');
      }

      setIsFirstLogin(false);
      setPassword('');
      setConfirmPassword('');
      alert('パスワードが設定されました。再度ログインしてください。');

    } catch (error) {
      console.error('Password set error:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('パスワード設定に失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // パスワード確認チェック
      if (password !== confirmPassword) {
        throw new Error('パスワードが一致しません');
      }

      if (password.length < 6) {
        throw new Error('パスワードは6文字以上で入力してください');
      }

      // パスワードリセットAPI
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login_id: loginId,
          password: password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'パスワードリセットに失敗しました');
      }

      // 成功時
      setShowPasswordReset(false);
      setPassword('');
      setConfirmPassword('');
      setLoginId('');
      alert('パスワードがリセットされました。新しいパスワードでログインしてください。');

    } catch (error) {
      console.error('Password reset error:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('パスワードリセットに失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetRequest = () => {
    setShowPasswordReset(true);
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleBackToLogin = () => {
    setShowPasswordReset(false);
    setIsFirstLogin(false);
    setShowManagerRegister(false);
    setPassword('');
    setConfirmPassword('');
    setManagerName('');
    setError('');
  };

  // 店長登録処理
  const handleManagerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // バリデーション
      if (!managerName || !email || !password) {
        throw new Error('すべての項目を入力してください');
      }

      if (!confirmPassword || password !== confirmPassword) {
        throw new Error('パスワードが一致しません');
      }

      // 店長登録API呼び出し
      const response = await fetch('/api/auth/register-manager', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: managerName,
          email: email,
          password: password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '登録に失敗しました');
      }

      // 登録成功
      alert('店長アカウントが作成されました。ログインしてください。');
      setShowManagerRegister(false);
      setManagerName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setLoginType('manager'); // 店長ログイン画面にセット

    } catch (error) {
      console.error('Manager registration error:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('登録に失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 店長登録画面
  if (showManagerRegister) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-500 rounded-2xl mx-auto mb-3 sm:mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">店長アカウント作成</h1>
            <p className="text-gray-600 text-sm sm:text-base px-2">新しい企業の店長アカウントを作成します</p>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg sm:text-xl text-center">店長情報入力</CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleManagerRegister} className="space-y-4 sm:space-y-5">
                <div className="space-y-2">
                  <label htmlFor="managerName" className="block text-sm font-medium text-gray-700">
                    店長名
                  </label>
                  <Input
                    id="managerName"
                    type="text"
                    placeholder="店長名を入力"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    required
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    メールアドレス
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="メールアドレスを入力"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    パスワード
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="パスワード（6文字以上）"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    パスワード確認
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="パスワードを再入力"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 sm:h-10 text-base sm:text-sm"
                  disabled={isLoading}
                >
                  {isLoading ? '作成中...' : '店長アカウント作成'}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    ログイン画面に戻る
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // パスワードリセット画面
  if (showPasswordReset) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-500 rounded-2xl mx-auto mb-3 sm:mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3a1 1 0 011-1h2.586l6.414-6.414a6 6 0 015.743-7.743z" />
              </svg>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">パスワードリセット</h1>
            <p className="text-gray-600 text-sm sm:text-base px-2">ログインIDを確認して新しいパスワードを設定してください</p>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg sm:text-xl text-center">新しいパスワードを設定</CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handlePasswordReset} className="space-y-4 sm:space-y-5">
                <div className="space-y-2">
                  <label htmlFor="resetLoginId" className="block text-sm font-medium text-gray-700">
                    ログイン用ID
                  </label>
                  <Input
                    id="resetLoginId"
                    type="text"
                    placeholder="ログインIDを入力"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    required
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                    新しいパスワード
                  </label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="新しいパスワード（6文字以上）"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">
                    パスワード確認
                  </label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    placeholder="パスワードを再入力"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>

                <Button 
                  type="submit" 
                  fullWidth 
                  disabled={isLoading}
                  className="mt-6 h-11 sm:h-10 text-base sm:text-sm font-medium"
                >
                  {isLoading ? 'パスワードリセット中...' : 'パスワードをリセット'}
                </Button>
              </form>

              <div className="mt-4">
                <Button 
                  variant="secondary" 
                  fullWidth
                  onClick={handleBackToLogin}
                  className="h-11 sm:h-10 text-base sm:text-sm"
                >
                  ログイン画面に戻る
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        {/* ロゴエリア - モバイル最適化 */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-500 rounded-2xl mx-auto mb-3 sm:mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">シフト管理システム</h1>
          <p className="text-gray-600 text-sm sm:text-base px-2">
            {isFirstLogin ? 'パスワードを設定してください' : 'ログイン用IDとパスワードを入力してください'}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg sm:text-xl text-center">{isFirstLogin ? 'パスワード設定' : 'ログイン'}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {!isFirstLogin && (
              <div className="mb-6">
                <div className="flex rounded-lg bg-gray-100 p-1">
                  <button
                    type="button"
                    onClick={() => setLoginType('staff')}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                      loginType === 'staff'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    👤 スタッフ
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginType('manager')}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                      loginType === 'manager'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    👔 店長
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={isFirstLogin ? handleFirstTimePasswordSet : handleLogin} className="space-y-4 sm:space-y-5">
              {loginType === 'manager' && !isFirstLogin ? (
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    メールアドレス
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="メールアドレスを入力"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="loginId" className="block text-sm font-medium text-gray-700">
                    {loginType === 'staff' || isFirstLogin ? 'スタッフID' : 'ログイン用ID'}
                  </label>
                  <Input
                    id="loginId"
                    type="text"
                    placeholder={loginType === 'staff' || isFirstLogin ? "スタッフIDを入力" : "ログインIDを入力"}
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    required
                    disabled={isFirstLogin}
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  パスワード
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder={isFirstLogin ? "新しいパスワード（6文字以上）" : "パスワードを入力"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="text-base sm:text-sm h-11 sm:h-10"
                />
              </div>

              {isFirstLogin && (
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    パスワード確認
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="パスワードを再入力"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="text-base sm:text-sm h-11 sm:h-10"
                  />
                </div>
              )}

              <Button 
                type="submit" 
                fullWidth 
                disabled={isLoading}
                className="mt-6 h-11 sm:h-10 text-base sm:text-sm font-medium"
              >
                {isLoading ? 
                  (isFirstLogin ? 'パスワード設定中...' : 'ログイン中...') : 
                  (isFirstLogin ? 'パスワードを設定' : 'ログイン')
                }
              </Button>
            </form>

            {/* パスワードを忘れた方へのリンク（通常ログイン時のみ表示） */}
            {!isFirstLogin && (
              <div className="mt-4 text-center space-y-2">
                <button
                  type="button"
                  onClick={handlePasswordResetRequest}
                  className="text-sm text-blue-600 hover:text-blue-500 underline py-2 px-4 min-h-[44px] inline-flex items-center justify-center"
                >
                  パスワードを忘れた方はこちら
                </button>
                
                {/* 店長登録ボタン（店長ログイン時のみ表示） */}
                {loginType === 'manager' && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowManagerRegister(true)}
                      className="text-sm text-blue-600 hover:text-blue-700 underline py-2 px-4 min-h-[44px] inline-flex items-center justify-center"
                    >
                      👔 初めての方は店長アカウント作成
                    </button>
                  </div>
                )}
              </div>
            )}

            {isFirstLogin && (
              <div className="mt-4">
                <Button 
                  variant="secondary" 
                  fullWidth
                  onClick={handleBackToLogin}
                  className="h-11 sm:h-10 text-base sm:text-sm"
                >
                  戻る
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* フッター */}
        <div className="text-center mt-4 sm:mt-6">
          <p className="text-xs sm:text-sm text-gray-500">
            © 2024 シフト管理システム
          </p>
        </div>
      </div>
    </div>
  );
} 