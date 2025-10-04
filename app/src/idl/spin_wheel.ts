export const IDL = {
  "address": "8sBBFZcLgMA8mXZCZ8q6L2o27sqSPJEqgSa9G2gvdKNu",
  "metadata": {
    "name": "spin_wheel",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "fund_pool",
      "discriminator": [
        36,
        57,
        233,
        176,
        181,
        20,
        87,
        159
      ],
      "accounts": [
        {
          "name": "game_state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "reward_pool",
          "writable": true
        },
        {
          "name": "funder_token_account",
          "writable": true
        },
        {
          "name": "funder",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
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
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "game_state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "wolf_token_mint"
        },
        {
          "name": "reward_pool",
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "spin",
      "discriminator": [
        87,
        64,
        120,
        10,
        25,
        224,
        122,
        93
      ],
      "accounts": [
        {
          "name": "game_state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "reward_pool",
          "writable": true
        },
        {
          "name": "player_token_account",
          "writable": true
        },
        {
          "name": "dev_fee_account",
          "writable": true
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "bet_amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw_profits",
      "discriminator": [
        233,
        0,
        237,
        50,
        45,
        56,
        17,
        250
      ],
      "accounts": [
        {
          "name": "game_state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "reward_pool",
          "writable": true
        },
        {
          "name": "authority_token_account",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
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
  "accounts": [
    {
      "name": "GameState",
      "discriminator": [
        144,
        94,
        208,
        172,
        248,
        99,
        134,
        120
      ]
    }
  ],
  "events": [
    {
      "name": "SpinResult",
      "discriminator": [
        187,
        207,
        210,
        25,
        66,
        15,
        173,
        156
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
  ],
  "types": [
    {
      "name": "GameState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "wolf_token_mint",
            "type": "pubkey"
          },
          {
            "name": "reward_pool",
            "type": "pubkey"
          },
          {
            "name": "total_spins",
            "type": "u64"
          },
          {
            "name": "dev_fees_collected",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "SpinResult",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "bet_amount",
            "type": "u64"
          },
          {
            "name": "multiplier",
            "type": "u64"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "random_number",
            "type": "u8"
          },
          {
            "name": "outcome",
            "type": "string"
          },
          {
            "name": "pool_balance",
            "type": "u64"
          }
        ]
      }
    }
  ]
}

export type SpinWheel = typeof IDL