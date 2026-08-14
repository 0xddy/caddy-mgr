export default defineAppConfig({
  ui: {
    colors: {
      primary: 'emerald',
      neutral: 'zinc',
    },
    button: {
      defaultVariants: {
        color: 'primary',
        size: 'sm',
      },
      slots: {
        base: 'cursor-pointer',
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class:
            'text-white bg-primary hover:bg-primary/75 active:bg-primary/75 disabled:bg-primary aria-disabled:bg-primary outline-primary/25 focus-visible:outline-3',
        },
      ],
    },
  },
})
