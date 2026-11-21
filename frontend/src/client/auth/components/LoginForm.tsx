import { useState } from 'react';
import { Alert, Button, Checkbox, Form, Input } from 'antd';
import type { LoginCredentials } from '@/shared/types/auth';

export type LoginFormValues = LoginCredentials & { remember: boolean };

interface LoginFormProps {
  /** Trả về thông báo lỗi nếu đăng nhập thất bại, null nếu thành công. */
  onSubmit: (values: LoginFormValues) => string | null | Promise<string | null>;
  onForgotPassword: () => void;
}

const labelClass = 'text-[13px] font-semibold text-ink';
const inputClass = 'rounded-lg placeholder:text-[#98A2B3]';

export function LoginForm({ onSubmit, onForgotPassword }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async (values: LoginFormValues) => {
    setSubmitting(true);
    setError(null);
    const message = await onSubmit(values);
    if (message) {
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <Form<LoginFormValues>
      layout="vertical"
      requiredMark={false}
      initialValues={{ remember: false }}
      onFinish={handleFinish}
      onValuesChange={() => error && setError(null)}
    >
      {error && <Alert type="error" showIcon message={error} className="mb-6" />}

      <Form.Item
        name="email"
        label={<span className={labelClass}>Email</span>}
        className="mb-9"
        rules={[
          { required: true, message: 'Vui lòng nhập email' },
          { type: 'email', message: 'Email không hợp lệ' },
        ]}
      >
        <Input
          size="large"
          className={inputClass}
          style={{ fontSize: 15 }}
          placeholder="name@university.edu"
          autoComplete="email"
          inputMode="email"
        />
      </Form.Item>

      <Form.Item
        name="password"
        label={<span className={labelClass}>Mật khẩu</span>}
        className="mb-4"
        rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
      >
        <Input.Password
          size="large"
          className={inputClass}
          style={{ fontSize: 15 }}
          placeholder="Nhập mật khẩu"
          autoComplete="current-password"
        />
      </Form.Item>

      <div className="mb-8 flex items-center justify-between gap-4">
        <Form.Item name="remember" valuePropName="checked" noStyle>
          <Checkbox>
            <span className="text-xs text-muted">Ghi nhớ đăng nhập trên thiết bị này</span>
          </Checkbox>
        </Form.Item>
        <button
          type="button"
          onClick={onForgotPassword}
          className="shrink-0 text-xs font-semibold text-accent hover:text-accent-dark"
        >
          Quên mật khẩu?
        </button>
      </div>

      <Button
        type="primary"
        htmlType="submit"
        size="large"
        block
        loading={submitting}
        style={{ height: 44 }}
        className="text-[15px] font-semibold"
      >
        Đăng nhập
      </Button>
    </Form>
  );
}
