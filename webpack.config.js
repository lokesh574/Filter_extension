const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');

const config = {
  entry: [
    path.resolve(__dirname, 'src', 'index.js'),
    path.resolve(__dirname, 'src', 'index.scss'),
  ],
  output: {
    path: path.join(__dirname, 'dist'), // bundled file in dist/
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.js$/, // applies to js files
        use: ['babel-loader'], // transpiles your js
        exclude: /node_modules/, // don't transpile node modules
      },
      {
        test: /\.s?[ac]ss$/, // applies to css/scss/sass files
        use: [
          MiniCssExtractPlugin.loader, // create bundled css file
          {
            loader: 'css-loader', // resolves @import statements
            options: { url: false } // don't resolve url() statements
          },
          'sass-loader', // compiles sass to css
        ]
      }
    ],
  },
  plugins: [
    new MiniCssExtractPlugin(),
    new CopyPlugin({
      patterns: [
        { from: 'node_modules/@mediapipe/face_mesh/*.wasm', to: 'dist/[name][ext]' },
        { from: 'node_modules/@mediapipe/face_mesh/*.data', to: 'dist/[name][ext]' },
        { from: 'node_modules/@mediapipe/face_mesh/*.js', to: 'dist/[name][ext]' },
        { from: 'node_modules/@mediapipe/camera_utils/*.js', to: 'dist/[name][ext]' },
        { from: 'node_modules/@mediapipe/drawing_utils/*.js', to: 'dist/[name][ext]' },
      ],
    }),
  ],
};

module.exports = (env, argv) => {
  if (argv.mode === 'production') {
    config.devtool = 'source-map';
  } else {
    config.devtool = 'eval-source-map';
  }

  return config;
}