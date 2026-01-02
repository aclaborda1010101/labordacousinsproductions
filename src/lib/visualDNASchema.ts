// ============================================
// VISUAL DNA SCHEMA - TypeScript Types
// Complete 80+ field structured schema
// ============================================

export interface CharacterVisualDNA {
  character_id?: string;
  version: number;
  
  physical_identity: {
    age_exact_for_prompt: number;
    gender_presentation: 'masculine' | 'feminine' | 'androgynous' | 'nonbinary';
    ethnicity: {
      primary: EthnicityType;
      secondary?: EthnicityType;
      skin_tone_description: string;
      skin_tone_hex_approx: string;
    };
    height: {
      cm: number;
      build_reference?: string;
    };
    body_type: {
      somatotype: SomatotypeType;
      posture: PostureType;
      musculature?: MusculatureType;
      body_fat?: BodyFatType;
      weight_appearance?: WeightAppearanceType;
    };
  };

  face: {
    shape: FaceShapeType;
    eyes: {
      color_base: EyeColorType;
      color_hex_approx: string;
      color_description: string;
      shape: EyeShapeType;
      size: SizeType;
      distance: EyeDistanceType;
      eyebrows: {
        thickness: ThicknessType;
        shape: EyebrowShapeType;
        color: string;
        grooming: GroomingType;
      };
    };
    nose: {
      bridge: {
        height: HeightType;
        width: WidthType;
        shape: NoseBridgeShapeType;
      };
      tip: {
        shape: NoseTipShapeType;
        width: WidthType;
      };
      nostrils: {
        shape: NostrilShapeType;
        visibility: VisibilityType;
      };
    };
    mouth: {
      lips: {
        fullness_upper: FullnessType;
        fullness_lower: FullnessType;
        shape: {
          cupids_bow: CupidsBowType;
          corners: LipCornersType;
        };
        color_natural: string;
      };
      width: WidthType;
      teeth: {
        visibility_at_rest: VisibilityType;
        color: string;
        alignment: string;
      };
    };
    jaw_chin: {
      jawline: {
        shape: JawlineShapeType;
        definition: DefinitionType;
      };
      chin: {
        projection: ChinProjectionType;
        shape: ChinShapeType;
        cleft?: boolean;
      };
    };
    cheekbones: {
      prominence: ProminenceType;
      position: CheekbonePositionType;
    };
    forehead: {
      height: HeightType;
      width: WidthType;
      shape: ForeheadShapeType;
    };
    ears: {
      size: SizeType;
      position: EarPositionType;
      shape: EarShapeType;
    };
    facial_hair: {
      type: FacialHairType;
      length_mm?: number;
      density: DensityType;
      color: {
        base: string;
        grey_percentage: number;
      };
      grooming: GroomingType;
      style_description?: string;
    };
    distinctive_marks: {
      scars: Array<{
        location: string;
        description: string;
        size_cm: number;
        color: ScarColorType;
        visibility: MarkVisibilityType;
      }>;
      moles_birthmarks: Array<{
        location: string;
        type: MoleType;
        size_mm: number;
        color: string;
      }>;
      wrinkles_lines: {
        forehead: {
          horizontal_lines: WrinkleLevelType;
          frown_lines: WrinkleLevelType;
        };
        eyes: {
          crows_feet: WrinkleLevelType;
          under_eye: WrinkleLevelType;
        };
        nose_to_mouth: {
          nasolabial_folds: NasolabialFoldsType;
        };
        mouth: {
          marionette_lines: WrinkleLevelType;
          lip_lines: WrinkleLevelType;
        };
      };
      tattoos_face: Array<{
        location: string;
        description: string;
        size_cm: number;
      }>;
    };
  };

  hair: {
    head_hair: {
      presence: HairPresenceType;
      length: {
        type: HairLengthType;
        measurement_cm?: number;
      };
      texture: {
        type: HairTextureType;
        thickness: HairThicknessType;
      };
      thickness: {
        density: HairDensityType;
      };
      color: {
        natural_base: string;
        hex_approx_base: string;
        dyed_current?: string;
        highlights?: string[];
        grey_white: {
          percentage: number;
          pattern: GreyPatternType;
        };
      };
      style: {
        overall_shape: string;
        parting: PartingType;
        fringe_bangs: FringeBangsType;
        grooming_level: GroomingLevelType;
      };
      hairline: {
        front: HairlineFrontType;
        temples: HairlineTemplesType;
      };
      distinctive_features: string[];
    };
    body_hair: {
      arms: DensityType;
      chest: DensityType;
      legs: DensityType;
    };
  };

  skin: {
    texture: {
      overall: SkinTextureType;
      pore_visibility: VisibilityType;
    };
    condition: {
      clarity: SkinClarityType;
      hydration: SkinHydrationtype;
      hyperpigmentation: {
        freckles: FrecklesType;
        sun_spots: SunSpotsType;
      };
    };
    undertone: {
      type: UndertoneType;
      veins_visible: boolean;
    };
    sun_exposure: SunExposureType;
    distinctive_features: string[];
  };

  hands: {
    size: {
      overall: SizeType;
      palm_width: WidthType;
    };
    fingers: {
      length: LengthType;
      shape: FingerShapeType;
    };
    skin: {
      texture: HandSkinTextureType;
      veins_visible: boolean;
    };
    nails: {
      length: NailLengthType;
      shape: NailShapeType;
      condition: NailConditionType;
    };
    distinctive_features: string[];
  };

  visual_references: {
    celebrity_likeness: {
      primary: {
        name: string;
        percentage: number;
        features_borrowed: string[];
      };
      secondary?: {
        name: string;
        percentage: number;
        features_borrowed: string[];
      };
      tertiary?: {
        name: string;
        percentage: number;
        features_borrowed: string[];
      };
      combination_description: string;
    };
    art_style: {
      primary: ArtStyleType;
      description: string;
    };
    era_reference?: string;
    mood_board_urls?: string[];
  };

  continuity_lock: {
    never_change: string[];
    must_avoid: string[];
    allowed_variants: Array<{
      field_path: string;
      allowed_values: string[];
      context: string;
    }>;
    scene_invariants?: Array<{
      scene_range: string;
      locked_fields: string[];
      reason: string;
    }>;
    version_notes?: string;
  };
}

// ============================================
// ENUM TYPES
// ============================================

export type EthnicityType = 
  | 'caucasian_northern_european'
  | 'caucasian_southern_european'
  | 'caucasian_eastern_european'
  | 'african_west'
  | 'african_east'
  | 'african_southern'
  | 'african_american'
  | 'asian_east_chinese'
  | 'asian_east_japanese'
  | 'asian_east_korean'
  | 'asian_southeast'
  | 'asian_south_indian'
  | 'asian_south_pakistani'
  | 'asian_central'
  | 'middle_eastern_arab'
  | 'middle_eastern_persian'
  | 'middle_eastern_turkish'
  | 'latin_mexican'
  | 'latin_caribbean'
  | 'latin_south_american'
  | 'indigenous_american'
  | 'pacific_islander'
  | 'mixed_multiethnic';

export type SomatotypeType = 
  | 'ectomorph_lean_thin'
  | 'ectomorph_tall_slender'
  | 'mesomorph_athletic_muscular'
  | 'mesomorph_broad_strong'
  | 'endomorph_stocky_rounded'
  | 'endomorph_heavy_set'
  | 'average_balanced';

export type PostureType = 
  | 'upright_military'
  | 'upright_confident'
  | 'relaxed_natural'
  | 'slouched_casual'
  | 'hunched_protective'
  | 'asymmetric_leaning';

export type MusculatureType = 
  | 'very_low_soft'
  | 'low_some_definition'
  | 'moderate_fit'
  | 'athletic_defined'
  | 'very_muscular_bodybuilder';

export type BodyFatType = 
  | 'very_low_veins_visible'
  | 'low_lean'
  | 'average_healthy'
  | 'above_average_soft'
  | 'high_overweight';

export type WeightAppearanceType = 
  | 'underweight_thin'
  | 'slim_lean'
  | 'average_proportional'
  | 'stocky_solid'
  | 'overweight_heavy';

export type FaceShapeType = 
  | 'oval_balanced'
  | 'round_full'
  | 'square_angular'
  | 'heart_pointed_chin'
  | 'diamond_narrow_forehead'
  | 'oblong_long'
  | 'triangle_wide_jaw';

export type EyeColorType = 
  | 'brown_dark'
  | 'brown_medium'
  | 'brown_light_amber'
  | 'hazel_brown_green_mix'
  | 'green_pure'
  | 'green_grey_mix'
  | 'blue_dark'
  | 'blue_medium'
  | 'blue_light_ice'
  | 'grey_light'
  | 'grey_blue_mix'
  | 'black_very_dark';

export type EyeShapeType = 
  | 'almond_balanced'
  | 'round_large'
  | 'hooded_heavy_lid'
  | 'upturned_cat_eye'
  | 'downturned_droopy'
  | 'monolid_asian'
  | 'deep_set_sunken';

export type SizeType = 'small_delicate' | 'small_narrow' | 'medium_average' | 'large_wide' | 'large_robust';
export type HeightType = 'low' | 'medium' | 'high_prominent';
export type WidthType = 'narrow' | 'medium' | 'wide' | 'wide_flared';
export type LengthType = 'short' | 'medium_average' | 'long';
export type ThicknessType = 'thin' | 'medium' | 'thick' | 'very_thick_bushy';
export type FullnessType = 'thin' | 'medium' | 'full' | 'very_full';
export type DensityType = 'none' | 'sparse_patchy' | 'moderate_some_patches' | 'thick_full_coverage';
export type VisibilityType = 'hidden' | 'subtle' | 'moderate' | 'prominent';
export type DefinitionType = 'undefined_soft_fat_covering' | 'moderate_visible_bone_structure' | 'sharp_very_defined';
export type ProminenceType = 'flat_subtle' | 'moderate_visible' | 'high_prominent' | 'very_high_striking';
export type GroomingType = 'natural_ungroomed' | 'trimmed_neat' | 'shaped_groomed' | 'styled_precise';

export type EyeDistanceType = 'close_set' | 'average_balanced' | 'wide_set';
export type EyebrowShapeType = 'straight_horizontal' | 'soft_arch' | 'high_arch' | 'angled_sharp' | 's_shaped';
export type NoseBridgeShapeType = 'straight' | 'convex_roman' | 'concave_scooped' | 'wavy';
export type NoseTipShapeType = 'rounded_bulbous' | 'button_small' | 'pointed_sharp' | 'upturned' | 'downturned_droopy';
export type NostrilShapeType = 'narrow_pinched' | 'oval_balanced' | 'round_wide' | 'flared';
export type CupidsBowType = 'undefined_straight' | 'soft_subtle' | 'defined_prominent' | 'very_pronounced';
export type LipCornersType = 'downturned_sad_resting' | 'straight_neutral' | 'upturned_smile_resting';
export type JawlineShapeType = 'soft_rounded_feminine' | 'moderate_slight_angle' | 'angular_defined' | 'very_angular_square_masculine';
export type ChinProjectionType = 'recessed_weak' | 'average_aligned_with_lips' | 'projected_strong';
export type ChinShapeType = 'rounded_soft' | 'square_flat' | 'pointed_sharp' | 'cleft_dimpled';
export type CheekbonePositionType = 'low_wide' | 'mid_balanced' | 'high_narrow';
export type ForeheadShapeType = 'flat' | 'slightly_rounded' | 'prominent_bulging' | 'sloped_back';
export type EarPositionType = 'close_to_head' | 'slightly_protruding' | 'protruding';
export type EarShapeType = 'small_rounded' | 'medium_standard' | 'large_elongated' | 'pointed_elfin';

export type FacialHairType = 
  | 'clean_shaven_smooth'
  | 'short_stubble_1_3mm'
  | 'medium_stubble_4_6mm'
  | 'heavy_stubble_7_10mm'
  | 'short_beard_trimmed'
  | 'full_beard_short'
  | 'full_beard_medium'
  | 'full_beard_long'
  | 'goatee_only'
  | 'mustache_only'
  | 'van_dyke'
  | 'mutton_chops'
  | 'soul_patch';

export type ScarColorType = 'white_healed' | 'pink_recent' | 'red_fresh' | 'dark_pigmented';
export type MarkVisibilityType = 'always_prominent' | 'closeup_only' | 'varies_with_lighting';
export type MoleType = 'flat_mole' | 'raised_mole' | 'birthmark_flat' | 'birthmark_raised';
export type WrinkleLevelType = 'none' | 'faint' | 'moderate' | 'deep_prominent';
export type NasolabialFoldsType = 'none_smooth' | 'slight_when_smiling' | 'moderate_visible_at_rest' | 'deep_prominent';

export type HairPresenceType = 'full_head' | 'thinning_top' | 'receding_hairline' | 'balding_crown' | 'bald_shaved' | 'bald_natural';
export type HairLengthType = 
  | 'shaved_buzzcut_0_3mm'
  | 'very_short_3_10mm'
  | 'short_1_3cm'
  | 'short_medium_3_8cm'
  | 'medium_8_15cm'
  | 'medium_long_15_25cm'
  | 'long_25_40cm'
  | 'very_long_40cm_plus';
export type HairTextureType = 'straight_type_1' | 'wavy_loose_type_2a' | 'wavy_defined_type_2b' | 'curly_loose_type_3a' | 'curly_tight_type_3b' | 'coily_springy_type_4a' | 'coily_zigzag_type_4b';
export type HairThicknessType = 'fine_thin_strand' | 'medium_normal_strand' | 'coarse_thick_strand';
export type HairDensityType = 'sparse_thin' | 'medium_average' | 'thick_dense' | 'very_thick_abundant';
export type GreyPatternType = 'none' | 'temples_only' | 'temples_spreading' | 'scattered_salt_pepper' | 'mostly_grey' | 'fully_white';
export type PartingType = 'none_swept_back' | 'left_side' | 'right_side' | 'center' | 'no_defined_parting';
export type FringeBangsType = 'none_forehead_exposed' | 'side_swept' | 'curtain_bangs' | 'blunt_straight' | 'wispy_textured';
export type GroomingLevelType = 'unkempt_messy' | 'casually_styled' | 'neatly_groomed' | 'professionally_styled' | 'slicked_precise';
export type HairlineFrontType = 'straight_juvenile' | 'slight_peaks' | 'widows_peak' | 'm_shaped_receding' | 'fully_receded';
export type HairlineTemplesType = 'full_no_recession' | 'slight_recession' | 'moderate_recession' | 'significant_recession';

export type SkinTextureType = 'smooth_clean_healthy' | 'smooth_natural_visible_pores' | 'textured_pores_prominent' | 'rough_weathered' | 'scarred_damaged';
export type SkinClarityType = 'perfectly_clear' | 'mostly_clear_minor_blemishes' | 'some_blemishes_occasional_breakouts' | 'acne_visible';
export type SkinHydrationtype = 'oily_shiny' | 'combination_t_zone_oily' | 'normal_balanced' | 'dry_matte' | 'very_dry_flaky';
export type FrecklesType = 'none' | 'light_scattered' | 'moderate_nose_cheeks' | 'heavy_face_and_body';
export type SunSpotsType = 'none' | 'few_minor' | 'several_visible' | 'many_prominent';
export type UndertoneType = 'cool_pink_red' | 'neutral_balanced' | 'warm_yellow_peach' | 'olive_green_yellow';
export type SunExposureType = 'very_pale_indoor' | 'fair_minimal_sun' | 'light_tan' | 'medium_tan' | 'deep_tan' | 'weathered_sun_damage';

export type FingerShapeType = 'slender_tapered' | 'average_proportional' | 'thick_robust' | 'knobby_arthritic';
export type HandSkinTextureType = 'soft_smooth' | 'normal_healthy' | 'rough_calloused' | 'weathered_aged';
export type NailLengthType = 'bitten_very_short' | 'short_trimmed' | 'medium_natural' | 'long_manicured';
export type NailShapeType = 'square' | 'rounded' | 'oval' | 'almond';
export type NailConditionType = 'damaged_bitten' | 'rough_unkempt' | 'clean_neat' | 'manicured_polished';

export type ArtStyleType = 'photorealistic' | 'cinematic_realistic' | 'hyperrealistic' | 'stylized_realistic' | 'painterly';

// ============================================
// DEFAULT VISUAL DNA
// ============================================

export function getDefaultVisualDNA(): CharacterVisualDNA {
  return {
    version: 1,
    physical_identity: {
      age_exact_for_prompt: 35,
      gender_presentation: 'masculine',
      ethnicity: {
        primary: 'caucasian_southern_european',
        skin_tone_description: 'olive skin with warm undertone',
        skin_tone_hex_approx: '#C2966A',
      },
      height: { cm: 178 },
      body_type: {
        somatotype: 'mesomorph_athletic_muscular',
        posture: 'upright_confident',
        musculature: 'athletic_defined',
        body_fat: 'average_healthy',
        weight_appearance: 'average_proportional',
      },
    },
    face: {
      shape: 'oval_balanced',
      eyes: {
        color_base: 'brown_medium',
        color_hex_approx: '#6B5B3D',
        color_description: 'warm brown with amber flecks around the pupil',
        shape: 'almond_balanced',
        size: 'medium_average',
        distance: 'average_balanced',
        eyebrows: {
          thickness: 'medium',
          shape: 'soft_arch',
          color: 'dark brown',
          grooming: 'natural_ungroomed',
        },
      },
      nose: {
        bridge: {
          height: 'medium',
          width: 'medium',
          shape: 'straight',
        },
        tip: {
          shape: 'rounded_bulbous',
          width: 'medium',
        },
        nostrils: {
          shape: 'oval_balanced',
          visibility: 'subtle',
        },
      },
      mouth: {
        lips: {
          fullness_upper: 'medium',
          fullness_lower: 'medium',
          shape: {
            cupids_bow: 'soft_subtle',
            corners: 'straight_neutral',
          },
          color_natural: 'natural pink',
        },
        width: 'medium',
        teeth: {
          visibility_at_rest: 'hidden',
          color: 'natural white',
          alignment: 'straight',
        },
      },
      jaw_chin: {
        jawline: {
          shape: 'angular_defined',
          definition: 'moderate_visible_bone_structure',
        },
        chin: {
          projection: 'average_aligned_with_lips',
          shape: 'square_flat',
        },
      },
      cheekbones: {
        prominence: 'moderate_visible',
        position: 'mid_balanced',
      },
      forehead: {
        height: 'medium',
        width: 'medium',
        shape: 'slightly_rounded',
      },
      ears: {
        size: 'medium_average',
        position: 'close_to_head',
        shape: 'medium_standard',
      },
      facial_hair: {
        type: 'short_stubble_1_3mm',
        length_mm: 2,
        density: 'moderate_some_patches',
        color: {
          base: 'dark brown',
          grey_percentage: 0,
        },
        grooming: 'trimmed_neat',
      },
      distinctive_marks: {
        scars: [],
        moles_birthmarks: [],
        wrinkles_lines: {
          forehead: {
            horizontal_lines: 'faint',
            frown_lines: 'none',
          },
          eyes: {
            crows_feet: 'faint',
            under_eye: 'none',
          },
          nose_to_mouth: {
            nasolabial_folds: 'slight_when_smiling',
          },
          mouth: {
            marionette_lines: 'none',
            lip_lines: 'none',
          },
        },
        tattoos_face: [],
      },
    },
    hair: {
      head_hair: {
        presence: 'full_head',
        length: {
          type: 'short_medium_3_8cm',
          measurement_cm: 5,
        },
        texture: {
          type: 'wavy_loose_type_2a',
          thickness: 'medium_normal_strand',
        },
        thickness: {
          density: 'medium_average',
        },
        color: {
          natural_base: 'dark brown',
          hex_approx_base: '#3D2817',
          grey_white: {
            percentage: 0,
            pattern: 'none',
          },
        },
        style: {
          overall_shape: 'short on sides, longer on top, textured and swept back',
          parting: 'left_side',
          fringe_bangs: 'none_forehead_exposed',
          grooming_level: 'casually_styled',
        },
        hairline: {
          front: 'straight_juvenile',
          temples: 'full_no_recession',
        },
        distinctive_features: [],
      },
      body_hair: {
        arms: 'moderate_some_patches',
        chest: 'moderate_some_patches',
        legs: 'moderate_some_patches',
      },
    },
    skin: {
      texture: {
        overall: 'smooth_natural_visible_pores',
        pore_visibility: 'subtle',
      },
      condition: {
        clarity: 'mostly_clear_minor_blemishes',
        hydration: 'normal_balanced',
        hyperpigmentation: {
          freckles: 'none',
          sun_spots: 'none',
        },
      },
      undertone: {
        type: 'warm_yellow_peach',
        veins_visible: false,
      },
      sun_exposure: 'light_tan',
      distinctive_features: [],
    },
    hands: {
      size: {
        overall: 'medium_average',
        palm_width: 'medium',
      },
      fingers: {
        length: 'medium_average',
        shape: 'average_proportional',
      },
      skin: {
        texture: 'normal_healthy',
        veins_visible: false,
      },
      nails: {
        length: 'short_trimmed',
        shape: 'square',
        condition: 'clean_neat',
      },
      distinctive_features: [],
    },
    visual_references: {
      celebrity_likeness: {
        primary: {
          name: '',
          percentage: 60,
          features_borrowed: [],
        },
        combination_description: '',
      },
      art_style: {
        primary: 'cinematic_realistic',
        description: 'Photorealistic cinematic quality, like a movie still',
      },
    },
    continuity_lock: {
      never_change: [
        'physical_identity.age_exact_for_prompt',
        'face.eyes.color_base',
        'face.shape',
        'physical_identity.height.cm',
      ],
      must_avoid: [],
      allowed_variants: [],
    },
  };
}
