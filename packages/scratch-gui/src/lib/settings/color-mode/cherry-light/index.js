// This object is passed directly to Blockly, hence the colour* fields need to
// be named exactly as they are, including the UK spelling of "colour".
const blockColors = {
    motion: {
        colourPrimary: '#E8456B',
        colourSecondary: '#D22F55',
        colourTertiary: '#B8244A',
        colourQuaternary: '#B8244A'
    },
    looks: {
        colourPrimary: '#A45BD8',
        colourSecondary: '#8F44C4',
        colourTertiary: '#7C35AD',
        colourQuaternary: '#7C35AD'
    },
    sounds: {
        colourPrimary: '#D14BA8',
        colourSecondary: '#BF3896',
        colourTertiary: '#A62D80',
        colourQuaternary: '#A62D80'
    },
    control: {
        colourPrimary: '#F0924E',
        colourSecondary: '#DE7E38',
        colourTertiary: '#C4672A',
        colourQuaternary: '#C4672A'
    },
    event: {
        colourPrimary: '#E8B03A',
        colourSecondary: '#D39B28',
        colourTertiary: '#B9861B',
        colourQuaternary: '#B9861B'
    },
    sensing: {
        colourPrimary: '#6E86CC',
        colourSecondary: '#5A73BC',
        colourTertiary: '#4A62A8',
        colourQuaternary: '#4A62A8'
    },
    pen: {
        colourPrimary: '#2FA98D',
        colourSecondary: '#1F9579',
        colourTertiary: '#157E66',
        colourQuaternary: '#157E66'
    },
    operators: {
        colourPrimary: '#6DBD6D',
        colourSecondary: '#57AB57',
        colourTertiary: '#469446',
        colourQuaternary: '#469446'
    },
    data: {
        colourPrimary: '#EE7A3C',
        colourSecondary: '#DB6428',
        colourTertiary: '#C2541C',
        colourQuaternary: '#C2541C'
    },
    // This is not a new category, but rather for differentiation
    // between lists and scalar variables.
    data_lists: {
        colourPrimary: '#E05A32',
        colourSecondary: '#CB4922',
        colourTertiary: '#AF3B18',
        colourQuaternary: '#AF3B18'
    },
    more: {
        colourPrimary: '#E0455F',
        colourSecondary: '#CB2F4B',
        colourTertiary: '#AF213C',
        colourQuaternary: '#AF213C'
    },
    modules: {
        colourPrimary: '#D964C9',
        colourSecondary: '#C64EB5',
        colourTertiary: '#AC3D9C',
        colourQuaternary: '#AC3D9C'
    },
    text: '#FFFFFF',
    workspace: '#FFF7FA',
    toolboxHover: '#D6336C',
    toolboxSelected: '#FBDCE7',
    toolboxText: '#6B4452',
    toolbox: '#FFF2F6',
    flyout: '#FFF7FA',
    scrollbar: '#D8A9BB',
    scrollbarHover: '#C98FA5',
    textField: '#FFFFFF',
    textFieldText: '#5E3442',
    insertionMarker: '#3A1B25',
    insertionMarkerOpacity: 0.2,
    dragShadowOpacity: 0.6,
    stackGlow: '#FFF200',
    stackGlowSize: 4,
    stackGlowOpacity: 1,
    replacementGlow: '#FFFFFF',
    replacementGlowSize: 2,
    replacementGlowOpacity: 1,
    colourPickerStroke: '#FFFFFF',
    flyoutButtonBorder: '#E3B9C9',
    flyoutButtonHover: '#F6DDE7',
    // CSS colours: support RGBA
    fieldShadow: 'rgba(255, 255, 255, 0.3)',
    dropDownShadow: 'rgba(0, 0, 0, .3)',
    numPadBackground: '#B25479',
    numPadBorder: '#914363',
    numPadActiveBackground: '#914363',
    numPadText: 'white', // Do not use hex here, it cannot be inlined with data-uri SVG
    valueReportBackground: '#FFFFFF',
    valueReportBorder: '#AAAAAA',
    menuHover: 'rgba(0, 0, 0, 0.2)'
};

const extensions = {};

export {
    blockColors,
    extensions
};
