# Recursia Style Guidelines

Recursia follows its own coding conventions, which may differ from the formatting and architectural standards used by the original Scratch codebase.

**All newly written Recursia code must follow these guidelines**, even when they conflict with existing Scratch conventions. Existing code that does not require modification should retain its original formatting and style. When modifying existing code, apply Recursia conventions to the whole file where it fits within reason.

## 1. Indentation

Use **tabs instead of spaces** for indentation.

Tabs are preferred for their consistency, ease of use, and visual clarity. Do not introduce space-based indentation into newly written Recursia code.

## 2. Comments and Documentation

Comments should explain code that is vague, complex, non-obvious, or otherwise difficult to understand.

- Use detailed comments when the reasoning or behavior of code is not immediately apparent.
- Explain unusual implementation decisions, edge cases, constraints, and important side effects.
- Avoid comments that simply restate what the code already makes obvious.
- Prefer clear naming and straightforward implementation over excessive comments.

Comments should provide useful context, not unnecessary narration.

## 3. Brace Formatting

Opening curly braces must remain on the same line as the statement or declaration that introduces them.

**Preferred:**
```js
if (5 < 10) {
	doSomething();
}

function example() {
	return true;
}

class Example {
	constructor() {
		this.value = 0;
	}
}
```

**Avoid:**
```js
if (5 < 10)
{
	doSomething();
}
```

This convention applies to control structures, functions, classes, and other applicable block declarations.

## 4. Internal Naming Conventions

Internal implementation details should be identifiable through their names.

Use one of the following conventions:

- `internal` within the name, such as `updateInternalState()`.
- A single underscore prefix, such as `_updateState()`.

For particularly fragile or sensitive internal implementation details, a double underscore prefix may be used:

- `__updateState()`

Double underscores should be reserved for implementation details that are especially fragile or should not be accessed casually.

These conventions communicate intent but do not, by themselves, enforce access restrictions.

## 5. Abstraction and Maintainability

Code should be abstracted wherever doing so improves readability, maintainability, reusability, or separation of concerns.

Prefer reusable implementations over duplicated logic. Avoid tightly coupling unrelated systems, and keep responsibilities clearly defined.

However, abstraction should not come at the expense of significant performance degradation or unnecessary complexity. When abstraction introduces substantial overhead or makes an otherwise simple implementation harder to understand, a more direct approach is acceptable.

**The goal is useful abstraction, not abstraction for its own sake.**

## 6. Object-Oriented Programming

Recursia's architecture should favor **object-oriented programming (OOP)** for organizing new systems and features.

Use classes and functions to encapsulate behavior, manage state, and establish clear interfaces between components.

- Prefer classes when an implementation benefits from encapsulated state, lifecycle management, inheritance, or clearly defined object responsibilities.
- Prefer functions for stateless operations, utilities, transformations, and simple reusable logic.
- Keep classes focused on well-defined responsibilities.
- Avoid unnecessary inheritance and excessive class hierarchies.

OOP should be the primary architectural approach for upcoming Recursia development, while functional patterns remain perfectly acceptable where they are the more appropriate solution.

---

## General Principle

Recursia code should prioritize **consistency, readability, maintainability, and deliberate architecture**.

These guidelines apply to new Recursia development. They are not a requirement to reformat the inherited Scratch codebase, and they should not be used as justification for unrelated formatting changes.