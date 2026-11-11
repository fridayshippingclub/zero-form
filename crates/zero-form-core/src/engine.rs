use crate::{contracts::*, facts::FactSource};
use anyhow::Result;

pub fn prepare_application(
    bundle: &DefinitionBundle,
    request: Request,
    source: &dyn FactSource,
    now: &str,
) -> Result<Preparation> {
    let snapshot = crate::facts::resolve(bundle, request, source, now)?;
    let mut issues = crate::mapping::validate(bundle, &snapshot)?;
    if issues.is_empty()
        && let Err(error) = crate::mapping::plan(bundle, &snapshot)
    {
        issues.push(Issue {
            code: "mapping_failed".into(),
            location: "documents".into(),
            message: error.to_string(),
        });
    }
    Ok(Preparation { snapshot, issues })
}
