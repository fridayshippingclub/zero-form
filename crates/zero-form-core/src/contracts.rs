use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub id: String,
    pub application_type: String,
    pub scope: String,
    pub as_of: String,
    pub roles: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Confirmation {
    Confirmed,
    Unknown,
    NotApplicable,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Fact {
    pub id: String,
    pub subject: String,
    pub predicate: String,
    pub value: Value,
    pub revision: String,
    pub source: String,
    pub confirmation: Confirmation,
    pub verification_event: Option<String>,
    pub valid_from: String,
    pub valid_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Relationship {
    pub id: String,
    pub from: String,
    pub to: String,
    pub kind: String,
    pub application_type: String,
    pub revision: String,
    pub source: String,
    pub valid_from: String,
    pub valid_to: Option<String>,
}

/// A local test adapter input, never a portable identity or authorization proof.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct FixtureFacts {
    pub scope: String,
    pub read_revision: String,
    pub grant_id: String,
    pub expires_on: String,
    pub allowed_fact_ids: BTreeSet<String>,
    pub allowed_relationship_ids: BTreeSet<String>,
    pub approved_definition_hashes: BTreeSet<String>,
    pub facts: Vec<Fact>,
    pub relationships: Vec<Relationship>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct FieldDefinition {
    pub role: String,
    pub predicate: String,
    #[serde(default)]
    pub require_verification_event: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum Condition {
    Always,
    Equals { field: String, value: Value },
    Present { field: String },
    All { conditions: Vec<Condition> },
    Any { conditions: Vec<Condition> },
    Not { condition: Box<Condition> },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum RuleCheck {
    RequiredWhen {
        condition: Condition,
        field: String,
    },
    Equal {
        left: String,
        right: String,
    },
    OneOf {
        field: String,
        values: Vec<Value>,
    },
    Sum {
        fields: Vec<String>,
        total: String,
        unit: String,
    },
    DateBefore {
        earlier: String,
        later: String,
    },
    Relationship {
        from_role: String,
        to_role: String,
        relation: String,
    },
    ChoiceCount {
        fields: Vec<String>,
        min: usize,
        max: usize,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Rule {
    pub id: String,
    pub version: String,
    pub source: String,
    pub check: RuleCheck,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ValueSource {
    Field { field: String },
    Item { pointer: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Transform {
    #[default]
    Identity,
    Uppercase,
    RocDate,
    Join {
        separator: String,
    },
    Affix {
        prefix: String,
        suffix: String,
    },
    StripSuffix {
        suffix: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub source: ValueSource,
    #[serde(default)]
    pub transform: Transform,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DocumentDefinition {
    pub id: String,
    pub template: String,
    pub condition: Condition,
    pub repeat_field: Option<String>,
    pub bindings: BTreeMap<String, Binding>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ApplicationDefinition {
    pub id: String,
    pub version: String,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub schema: Value,
    pub fields: BTreeMap<String, FieldDefinition>,
    pub rules: Vec<Rule>,
    pub documents: Vec<DocumentDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FilledBy {
    Applicant,
    Authority,
    Signature,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum TargetKind {
    Text { size: f64 },
    Checkbox,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Target {
    pub page: u32,
    /// [x, y, width, height], points, top-left origin.
    pub rect: [f64; 4],
    pub filled_by: FilledBy,
    pub control: TargetKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Asset {
    pub path: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct FontAsset {
    pub asset: Asset,
    pub family: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Template {
    pub version: String,
    pub source: Asset,
    pub font: FontAsset,
    pub targets: BTreeMap<String, Target>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DefinitionBundle {
    pub schema_version: u32,
    pub application: ApplicationDefinition,
    pub templates: BTreeMap<String, Template>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "state", rename_all = "snake_case", deny_unknown_fields)]
pub enum Resolved {
    Known { fact: Box<Fact> },
    Missing,
    Unknown,
    Conflict { fact_ids: Vec<String> },
    NotApplicable,
}
impl Resolved {
    pub fn value(&self) -> Option<&Value> {
        match self {
            Self::Known { fact } => Some(&fact.value),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    pub schema_version: u32,
    pub request: Request,
    pub definition_hash: String,
    pub read_revision: String,
    pub grant_id: String,
    pub trust_mode: String,
    pub fields: BTreeMap<String, Resolved>,
    pub relationships: Vec<Relationship>,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Issue {
    pub code: String,
    pub location: String,
    pub message: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Preparation {
    pub snapshot: Snapshot,
    pub issues: Vec<Issue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Write {
    pub target_id: String,
    pub target: Target,
    pub value: Value,
    pub source_field: String,
    pub fact_id: String,
    pub fact_revision: String,
    pub source_ref: String,
    pub transform: Transform,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DocumentPlan {
    pub id: String,
    pub template: String,
    pub writes: Vec<Write>,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ApplicationPlan {
    pub documents: Vec<DocumentPlan>,
    pub not_applicable: Vec<String>,
}
