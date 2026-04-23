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

interface InviteEmailProps {
  inviterName: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
}

export function InviteEmail({
  inviterName,
  organizationName,
  role,
  inviteUrl,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to {organizationName} on AccessAudit
      </Preview>
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
            You&apos;ve been invited!
          </Heading>
          <Text>
            <strong>{inviterName}</strong> has invited you to join{" "}
            <strong>{organizationName}</strong> on AccessAudit as a{" "}
            <strong>{role}</strong>.
          </Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button
              href={inviteUrl}
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
              Accept Invitation
            </Button>
          </Section>
          <Text style={{ color: "#71717a", fontSize: "14px" }}>
            This invitation will expire in 7 days.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
