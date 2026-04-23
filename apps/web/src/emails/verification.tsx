import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface VerificationEmailProps {
  userName: string;
  verificationUrl: string;
}

export function VerificationEmail({
  userName,
  verificationUrl,
}: VerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify your AccessAudit account</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            margin: "40px auto",
            padding: "40px",
            maxWidth: "480px",
          }}
        >
          <Heading style={{ fontSize: "24px", marginBottom: "16px" }}>
            Welcome to AccessAudit!
          </Heading>
          <Text>Hi {userName},</Text>
          <Text>
            Please verify your email address to get started with accessibility
            compliance monitoring.
          </Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button
              href={verificationUrl}
              style={{
                backgroundColor: "#6366f1",
                borderRadius: "6px",
                color: "#ffffff",
                display: "inline-block",
                fontSize: "16px",
                padding: "12px 24px",
                textDecoration: "none",
              }}
            >
              Verify Email
            </Button>
          </Section>
          <Text style={{ color: "#71717a", fontSize: "14px" }}>
            If you didn&apos;t create an account, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
