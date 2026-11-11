pub mod contracts;
pub mod definition;
pub mod engine;
pub mod facts;
pub mod mapping;
pub mod package;
pub mod pdf;
pub mod verification;

pub use engine::*;
mod composition;
pub fn wire_schemas() -> (schemars::Schema, schemars::Schema, schemars::Schema) {
    (
        schemars::schema_for!(contracts::DefinitionBundle),
        schemars::schema_for!(contracts::Request),
        schemars::schema_for!(contracts::FixtureFacts),
    )
}
