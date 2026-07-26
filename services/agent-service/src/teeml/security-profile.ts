export const PRODUCTION_PRIVATE_TEEML_PROFILE =
  "production-private-teeml" as const;
export const HACKATHON_TESTNET_TEETLS_PROFILE =
  "hackathon-testnet-teetls" as const;
export const PRODUCTION_TEEML_ALLOWED_STATUS = "TEEML_ALLOWED" as const;
export const HACKATHON_TEETLS_ALLOWED_STATUS =
  "TEETLS_HACKATHON_ALLOWED" as const;

export type ZeroGSecurityProfile =
  | typeof PRODUCTION_PRIVATE_TEEML_PROFILE
  | typeof HACKATHON_TESTNET_TEETLS_PROFILE;

export type ZeroGTrustMode = "private" | "verified";
export type ZeroGVerificationMode = "TeeML" | "TeeTLS";

export type ZeroGSecurityContract = Readonly<{
  securityProfile: ZeroGSecurityProfile;
  trustMode: ZeroGTrustMode;
  verificationMode: ZeroGVerificationMode;
  sealedInference: boolean;
  requiredNetwork: "mainnet" | "testnet";
}>;

const PRODUCTION_CONTRACT: ZeroGSecurityContract = {
  securityProfile: PRODUCTION_PRIVATE_TEEML_PROFILE,
  trustMode: "private",
  verificationMode: "TeeML",
  sealedInference: true,
  requiredNetwork: "mainnet",
};

const HACKATHON_CONTRACT: ZeroGSecurityContract = {
  securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
  trustMode: "verified",
  verificationMode: "TeeTLS",
  sealedInference: false,
  requiredNetwork: "testnet",
};

export function parseZeroGSecurityProfile(
  value: string | undefined,
): ZeroGSecurityProfile {
  if (value === undefined || value === "") {
    return PRODUCTION_PRIVATE_TEEML_PROFILE;
  }
  if (
    value === PRODUCTION_PRIVATE_TEEML_PROFILE ||
    value === HACKATHON_TESTNET_TEETLS_PROFILE
  ) {
    return value;
  }
  throw new Error("ZG_TEEML_SECURITY_PROFILE is invalid");
}

export function getZeroGSecurityContract(
  profile: ZeroGSecurityProfile,
): ZeroGSecurityContract {
  if (profile === PRODUCTION_PRIVATE_TEEML_PROFILE) {
    return PRODUCTION_CONTRACT;
  }
  if (profile === HACKATHON_TESTNET_TEETLS_PROFILE) {
    return HACKATHON_CONTRACT;
  }
  throw new Error("0G security profile is invalid");
}

export function isExactZeroGSecurityContract(input: {
  securityProfile: ZeroGSecurityProfile;
  trustMode: ZeroGTrustMode;
  verificationMode: ZeroGVerificationMode;
  sealedInference: boolean;
}): boolean {
  const expected = getZeroGSecurityContract(input.securityProfile);
  return (
    input.trustMode === expected.trustMode &&
    input.verificationMode === expected.verificationMode &&
    input.sealedInference === expected.sealedInference
  );
}

export function getAllowedActionStatus(
  profile: ZeroGSecurityProfile,
):
  | typeof PRODUCTION_TEEML_ALLOWED_STATUS
  | typeof HACKATHON_TEETLS_ALLOWED_STATUS {
  return profile === PRODUCTION_PRIVATE_TEEML_PROFILE
    ? PRODUCTION_TEEML_ALLOWED_STATUS
    : HACKATHON_TEETLS_ALLOWED_STATUS;
}

export function getAllowedVerificationStatus(
  profile: ZeroGSecurityProfile,
): "ALLOWED" | typeof HACKATHON_TEETLS_ALLOWED_STATUS {
  return profile === PRODUCTION_PRIVATE_TEEML_PROFILE
    ? "ALLOWED"
    : HACKATHON_TEETLS_ALLOWED_STATUS;
}
