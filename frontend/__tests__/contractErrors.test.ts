import {
  CONTRACT_ERROR_CODES,
  getContractErrorCode,
  getContractErrorMessage,
  parseContractError,
} from "../lib/contractErrors";

describe("contractErrors", () => {
  describe("CONTRACT_ERROR_CODES", () => {
    it("contains unique numeric values for all error codes", () => {
      const values = Object.values(CONTRACT_ERROR_CODES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it("defines newly synced contract error codes", () => {
      expect(CONTRACT_ERROR_CODES.ONLY_ADMIN_CAN_FREEZE_ESCROW).toBe(1025);
      expect(CONTRACT_ERROR_CODES.ESCROW_ALREADY_FROZEN).toBe(1026);
      expect(CONTRACT_ERROR_CODES.ESCROW_NOT_FROZEN).toBe(1027);
      expect(CONTRACT_ERROR_CODES.CANNOT_FREEZE_RESOLVED).toBe(1028);
      expect(CONTRACT_ERROR_CODES.ESCROW_ALREADY_SETTLED).toBe(2014);
      expect(CONTRACT_ERROR_CODES.PREVIOUS_MILESTONE_NOT_APPROVED).toBe(3008);
      expect(CONTRACT_ERROR_CODES.BID_INCREMENT_TOO_SMALL).toBe(4011);
      expect(CONTRACT_ERROR_CODES.ONLY_ADMIN_SET_QUORUM).toBe(6008);
      expect(CONTRACT_ERROR_CODES.QUORUM_EXCEEDS_MAX).toBe(6009);
      expect(CONTRACT_ERROR_CODES.QUORUM_PROPOSAL_NOT_PASSED).toBe(6010);
      expect(CONTRACT_ERROR_CODES.NO_MATCHING_QUORUM_PROPOSAL).toBe(6011);
      expect(CONTRACT_ERROR_CODES.TIMELOCK_ACTIVE).toBe(6012);
      expect(CONTRACT_ERROR_CODES.PROPOSAL_NOT_RESOLVED).toBe(6013);
      expect(CONTRACT_ERROR_CODES.PROPOSAL_DID_NOT_PASS).toBe(6014);
      expect(CONTRACT_ERROR_CODES.PROPOSAL_ALREADY_EXECUTED).toBe(6015);
      expect(CONTRACT_ERROR_CODES.MESSAGE_TOO_LONG).toBe(8004);
    });
  });

  describe("getContractErrorCode", () => {
    it("maps canonical panic messages to correct codes", () => {
      expect(getContractErrorCode("Escrow not found")).toBe(2004);
      expect(getContractErrorCode("Contract is frozen")).toBe(1003);
      expect(getContractErrorCode("Bidding is closed")).toBe(4005);
      expect(getContractErrorCode("Only an admin can freeze the escrow")).toBe(
        1025,
      );
      expect(
        getContractErrorCode(
          "Escrow already settled; deliverable hash cannot be updated",
        ),
      ).toBe(2014);
      expect(getContractErrorCode("Escrow already settled")).toBe(2014);
      expect(getContractErrorCode("Previous milestone not approved")).toBe(
        3008,
      );
      expect(
        getContractErrorCode(
          "Bid does not meet the minimum increment requirement",
        ),
      ).toBe(4011);
      expect(getContractErrorCode("TimelockActive")).toBe(6012);
      expect(getContractErrorCode("Proposal has not been resolved")).toBe(6013);
      expect(getContractErrorCode("Proposal did not pass")).toBe(6014);
      expect(getContractErrorCode("Proposal already executed")).toBe(6015);
      expect(getContractErrorCode("Message too long")).toBe(8004);
    });

    it("strips Error: and HostError: prefixes", () => {
      expect(getContractErrorCode("Error: Escrow not found")).toBe(2004);
      expect(getContractErrorCode("HostError: Contract is frozen")).toBe(1003);
    });

    it("handles Soroban Error(Contract, #N) and appended diagnostic messages", () => {
      expect(getContractErrorCode("Error(Contract, #1)")).toBe(
        CONTRACT_ERROR_CODES.UNKNOWN,
      );
      expect(
        getContractErrorCode("Error(Contract, #5): Escrow not found"),
      ).toBe(2004);
      expect(
        getContractErrorCode(
          "HostError: Error(Contract, #2): Contract is frozen",
        ),
      ).toBe(1003);
    });

    it("returns undefined for unknown error strings", () => {
      expect(getContractErrorCode("Random network failure")).toBeUndefined();
    });
  });

  describe("getContractErrorMessage", () => {
    it("returns English messages by default", () => {
      const msg = getContractErrorMessage(
        CONTRACT_ERROR_CODES.ESCROW_NOT_FOUND,
      );
      expect(msg).toBe("No escrow was found for this job.");
    });

    it("returns Spanish messages when requested", () => {
      const msg = getContractErrorMessage(
        CONTRACT_ERROR_CODES.ESCROW_NOT_FOUND,
        "es",
      );
      expect(msg).toBe("No se encontró un depósito para este trabajo.");
    });

    it("returns French messages when requested", () => {
      const msg = getContractErrorMessage(
        CONTRACT_ERROR_CODES.ESCROW_NOT_FOUND,
        "fr",
      );
      expect(msg).toBe("Aucun séquestre trouvé pour cette mission.");
    });

    it("returns localized generic message for UNKNOWN code", () => {
      expect(
        getContractErrorMessage(CONTRACT_ERROR_CODES.UNKNOWN, "en"),
      ).toContain("The contract rejected this operation");
      expect(
        getContractErrorMessage(CONTRACT_ERROR_CODES.UNKNOWN, "es"),
      ).toContain("El contrato rechazó esta operación");
      expect(
        getContractErrorMessage(CONTRACT_ERROR_CODES.UNKNOWN, "fr"),
      ).toContain("Le contrat a rejeté cette opération");
    });

    it("falls back to English for unsupported locales", () => {
      const msg = getContractErrorMessage(
        CONTRACT_ERROR_CODES.ESCROW_NOT_FOUND,
        "de",
      );
      expect(msg).toBe("No escrow was found for this job.");
    });
  });

  describe("parseContractError", () => {
    it("parses simulation failure prefix and translates message", () => {
      const result = parseContractError(
        "Soroban simulation failed: Escrow not found",
        "en",
      );
      expect(result).toBe("No escrow was found for this job.");
    });

    it("supports Spanish simulation error parsing", () => {
      const result = parseContractError(
        "Soroban simulation failed: Escrow not found",
        "es",
      );
      expect(result).toBe("No se encontró un depósito para este trabajo.");
    });

    it("preserves unmapped provider errors verbatim", () => {
      const original = "Connection refused by Horizon server";
      expect(parseContractError(original)).toBe(original);
    });
  });
});
