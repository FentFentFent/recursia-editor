
/**
 * Default styles supported by the Recursia VM.
 * @enum {string}
 */
const StyleType = {
    BigRoundedCorners: Symbol('bigRoundedCorners'),
    BowlerHat: Symbol('bowlerHat'),
    ClassicalHat: Symbol('classicalHat'),
    ExtremeRoundedCorners: Symbol('extremeRoundedCorners'),
    ExtraPadded: Symbol('extraPadded'),
    MediumRoundedCorners: Symbol('mediumRoundedCorners'),
    MinimalPadding: Symbol('minimalPadding'),
    NoRoundedCorners: Symbol('noRoundedCorners'),
    SmallRoundedCorners: Symbol('smallRoundedCorners')
}
module.exports = Object.freeze(StyleType);
