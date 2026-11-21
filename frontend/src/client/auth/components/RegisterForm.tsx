import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import type { RegisterData } from '@/shared/types/auth';

interface RegisterFormProps {
  /** Trả về thông báo lỗi nếu đăng ký thất bại, null nếu thành công. */
  onSubmit: (values: RegisterData) => string | null | Promise<string | null>;
}

const labelClass = 'text-[13px] font-semibold text-ink';
const inputClass = 'rounded-lg placeholder:text-[#98A2B3]';

export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async (values: RegisterData) => {
    setSubmitting(true);
    setError(null);
    const message = await onSubmit(values);
    if (message) {
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <Form<RegisterData>
      layout="vertical"
      requiredMark={false}
      onFinish={handleFinish}
      onValuesChange={() => error && setError(null)}
    >
      {error && <Alert type="error" showIcon message={error} className="mb-6" />}

      <Form.Item
        name="fullName"
        label={<span className={labelClass}>Họ và tên</span>}
        className="mb-5"
        rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
      >
        <Input size="large" className={inputClass} placeholder="Nguyễn Văn A" autoComplete="name" />
      </Form.Item>

      <Form.Item
        name="email"
        label={<span className={labelClass}>Email</span>}
        className="mb-5"
        rules={[
          { required: true, message: 'Vui lòng nhập email' },
          { type: 'email', message: 'Email không hợp lệ' },
        ]}
      >
        <Input
          size="large"
          className={inputClass}
          placeholder="name@university.edu"
          autoComplete="email"
          inputMode="email"
        />
      </Form.Item>

      <Form.Item
        name="password"
        label={<span className={labelClass}>Mật khẩu</span>}
        className="mb-5"
        rules={[
          { required: true, message: 'Vui lòng nhập mật khẩu' },
          { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
        ]}
      >
        <Input.Password
          size="large"
          className={inputClass}
          placeholder="Tối thiểu 8 ký tự"
          autoComplete="new-password"
        />
      </Form.Item>

      <Form.Item
        name="confirmPassword"
        label={<span className={labelClass}>Xác nhận mật khẩu</span>}
        className="mb-8"
        dependencies={['password']}
        rules={[
          { required: true, message: 'Vui lòng xác nhận mật khẩu' },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue('password') === value) return Promise.resolve();
              return Promise.reject(new Error('Mật khẩu xác nhận không khớp'));
            },
          }),
        ]}
      >
        <Input.Password
          size="large"
          className={inputClass}
          placeholder="Nhập lại mật khẩu"
          autoComplete="new-password"
        />
      </Form.Item>

      <Button
        type="primary"
        htmlType="submit"
        size="large"
        block
        loading={submitting}
        style={{ height: 44 }}
        className="text-[15px] font-semibold"
      >
        Tạo tài khoản
      </Button>
    </Form>
  );
}
