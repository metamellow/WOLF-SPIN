export const IDL = {
  "version": "0.1.0",
  "name": "spin_wheel",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "gameState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "wolfTokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rewardPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "spin",
      "accounts": [
        {
          "name": "gameState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rewardPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "playerTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "devFeeAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "player",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "betAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawProfits",
      "accounts": [
        {
          "name": "gameState",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rewardPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authorityTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fundPool",
      "accounts": [
        {
          "name": "gameState",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rewardPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "funderTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "funder",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "Unauthorized",
      "msg": "Unauthorized: Only the authority can perform this action"
    },
    {
      "code": 6001,
      "name": "BetTooLow",
      "msg": "Bet amount is below minimum (0.1% of pool)"
    },
    {
      "code": 6002,
      "name": "BetTooHigh",
      "msg": "Bet amount exceeds maximum (ensures 4x payout ≤ 50% of pool)"
    },
    {
      "code": 6003,
      "name": "InsufficientPool",
      "msg": "Insufficient funds in reward pool"
    },
    {
      "code": 6004,
      "name": "CalculationError",
      "msg": "Calculation error or overflow"
    },
    {
      "code": 6005,
      "name": "InvalidRewardPool",
      "msg": "Invalid reward pool account"
    },
    {
      "code": 6006,
      "name": "InvalidMint",
      "msg": "Invalid token mint"
    },
    {
      "code": 6007,
      "name": "InvalidTokenAccount",
      "msg": "Invalid token account"
    },
    {
      "code": 6008,
      "name": "InvalidDevAccount",
      "msg": "Invalid dev fee account"
    }
  ]
}

export type SpinWheel = typeof IDL