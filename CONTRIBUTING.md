# Contributing to @zirion/ioc

First off, thank you for considering contributing to **@zirion/ioc**! Your help is essential and much appreciated.

## How Can I Contribute?
### Reporting Bugs

If you find a bug, please open an issue on GitHub with as much detail as possible. Include:
- Environment setup or info
- Steps to reproduce the bug
- Expected behavior
- Actual behavior
- Screenshots or logs, if applicable

### Feature Requests
We welcome new ideas! If you have a feature request, please open an issue with:
- A clear and concise description of the feature
- Any relevant examples or mockups

### Pull Requests

1. **Fork the Repository**

   Fork the repo on GitHub and clone it to your local machine.

   ```bash
   git clone https://github.com/your-username/ioc.git
   cd ioc
   ```

2. **Create a Branch**

   Create a feature or bugfix branch based on the `main` branch.

   ```bash
   git checkout -b feature/my-new-feature
   ```

3. **Install Dependencies**

   Install the necessary dependencies.

   ```bash
   npm install
   ```

4. **Make Changes**

   Make your changes to the codebase.

5. **Test Changes**

   Ensure your changes pass existing tests and add new tests if necessary.

   ```bash
   npm test
   ```

6. **Commit Changes**

   Commit your changes with a clear and concise commit message like:

    ```
    <type>[optional scope]: <description>

    [optional body]
    
    [optional footer]
    ```

    Example:
    ```bash
    git commit -m "feat(): decorators support"
    ```

7. **Push Changes**

   Push your changes to your forked repository.

   ```bash
   git push origin feat/my-new-feature
   ```

8. **Open a Pull Request**

   Open a pull request against the `main` branch of the original repository. Fill out the pull request template and provide as much detail as possible.

### Code Style

Please follow the existing code style and conventions. We use [Prettier](https://prettier.io/) to maintain code consistency. You can format your code using:

```bash
npm run lint
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing!
