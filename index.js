const {
  GoalAvoid,
  GoalComposite,
  GoalExact,
  GoalInvert,
  GoalNear,
  GoalRegion,
  GoalXZ,
  GoalXZNear,
  GoalYLevel,
} = require("./src/goal");
const loader = require("./src/loader");

module.exports = {
  loader,
  goals: {
    GoalAvoid,
    GoalComposite,
    GoalExact,
    GoalInvert,
    GoalNear,
    GoalRegion,
    GoalXZ,
    GoalXZNear,
    GoalYLevel,
  },
};
